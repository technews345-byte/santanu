"""Hard risk layer. Deterministic, checked before EVERY order, and structurally isolated from the model:
RiskEngine.check() takes an Order, the Account and market facts. It never sees a Decision, a
probability or any model text, so there is no path by which model output can loosen a limit.

Behaviour:
  * Kill switch: armed in memory and mirrored to a file (state/KILL). Trips automatically at the
    max-drawdown limit. Once tripped it LATCHES: only reduce-only (flattening) orders pass until an
    operator clears it with `tradeagent reset-kill --i-understand`. Creating the file by hand also trips it.
  * Daily loss: at the limit, only reduce-only orders pass until the next UTC day.
  * Position / gross exposure / risk-per-trade: quantities are clipped down, never up.
  * Staleness, wide spread, order rate: entries are rejected.
  * Market profile: no entries outside the session / entry window, on holidays, after flat-by,
    or within 1% of a circuit band; quantities rounded down to whole shares where required;
    orders per second held well below the SEBI retail-algo threshold.
"""
from __future__ import annotations

import time
from collections import deque
from dataclasses import dataclass
from pathlib import Path

from .config import RiskLimits
from .markets import CRYPTO_SPOT, MarketProfile
from .models import Account, Order, Side


@dataclass(frozen=True)
class Verdict:
    approved: bool
    qty: float
    reason: str


class KillSwitch:
    def __init__(self, path: str | Path = "state/KILL"):
        self.path = Path(path)
        self._tripped = self.path.exists()

    @property
    def tripped(self) -> bool:
        if self.path.exists():
            self._tripped = True
        return self._tripped

    def trip(self, reason: str) -> None:
        self._tripped = True
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(f"{time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())} {reason}\n")

    def reset(self, operator_ack: bool) -> None:
        if not operator_ack:
            raise PermissionError("kill switch reset requires explicit operator acknowledgement")
        self.path.unlink(missing_ok=True)
        self._tripped = False


class RiskEngine:
    def __init__(self, limits: RiskLimits, kill: KillSwitch, market: MarketProfile = CRYPTO_SPOT):
        self.limits = limits
        self.kill = kill
        self.market = market
        self._order_times: deque[int] = deque()

    def update_marks(self, acct: Account, marks: dict[str, float], day: str) -> float:
        """Call on every snapshot. Updates peak/day anchors and trips the kill switch on drawdown."""
        eq = acct.equity(marks)
        if acct.day != day:
            acct.day, acct.day_start_equity = day, eq
        acct.peak_equity = max(acct.peak_equity, eq)
        dd = (acct.peak_equity - eq) / acct.peak_equity if acct.peak_equity > 0 else 0.0
        if dd >= self.limits.max_drawdown and not self.kill.tripped:
            self.kill.trip(f"max drawdown {dd:.2%} >= {self.limits.max_drawdown:.0%}")
        return eq

    def daily_loss_hit(self, acct: Account, eq: float) -> bool:
        return bool(acct.day_start_equity) and (eq / acct.day_start_equity - 1) <= -self.limits.max_daily_loss

    def _rate_ok(self, now_ms: int) -> bool:
        last_sec = sum(1 for t in self._order_times if t > now_ms - 1000)
        return last_sec < self.market.max_orders_per_second

    def check(self, order: Order, acct: Account, marks: dict[str, float], now_ms: int,
              snapshot_age_ms: int, spread_bps: float,
              band_lo: float | None = None, band_hi: float | None = None) -> Verdict:
        L, M = self.limits, self.market
        px = marks.get(order.symbol)
        if px is None or px <= 0 or order.qty <= 0:
            return Verdict(False, 0.0, "no mark or non-positive qty")
        pos = acct.positions.get(order.symbol)
        cur = pos.qty if pos else 0.0
        signed = order.qty if order.side == Side.BUY else -order.qty

        if order.reduce_only:
            # Must reduce |position| and not flip it. Always allowed, even with the kill switch.
            if cur == 0 or (cur > 0) == (signed > 0):
                return Verdict(False, 0.0, "reduce_only order does not reduce")
            if not M.is_open(now_ms):
                return Verdict(False, 0.0, "market closed")
            if not self._rate_ok(now_ms):
                return Verdict(False, 0.0, "per-second order cap")
            self._order_times.append(now_ms)
            return Verdict(True, min(order.qty, abs(cur)), "reduce_only")

        eq = acct.equity(marks)
        if self.kill.tripped:
            return Verdict(False, 0.0, "kill switch tripped")
        if eq <= 0:
            return Verdict(False, 0.0, "non-positive equity")
        if self.daily_loss_hit(acct, eq):
            return Verdict(False, 0.0, "daily loss limit")
        if not M.can_enter(now_ms):
            return Verdict(False, 0.0, f"{M.name}: outside session/entry window or holiday")
        if M.must_flatten(now_ms):
            return Verdict(False, 0.0, f"{M.name}: past flat-by time")
        if not M.circuit_ok(px, band_lo, band_hi):
            return Verdict(False, 0.0, "too close to circuit band")
        if snapshot_age_ms > L.max_snapshot_age_ms:
            return Verdict(False, 0.0, f"stale data {snapshot_age_ms}ms")
        if spread_bps > L.max_spread_bps:
            return Verdict(False, 0.0, f"spread {spread_bps:.1f}bps too wide")
        if signed < 0 and cur <= 0 and not (L.allow_short and M.allow_short):
            return Verdict(False, 0.0, "shorting disabled")
        # protective stop must exist and sit on the losing side
        if order.side == Side.BUY and not order.stop_price < px:
            return Verdict(False, 0.0, "buy stop not below price")
        if order.side == Side.SELL and not order.stop_price > px:
            return Verdict(False, 0.0, "sell stop not above price")

        while self._order_times and self._order_times[0] < now_ms - 3_600_000:
            self._order_times.popleft()
        if len(self._order_times) >= L.max_orders_per_hour:
            return Verdict(False, 0.0, "order rate limit")
        if not self._rate_ok(now_ms):
            return Verdict(False, 0.0, "per-second order cap")

        qty = order.qty
        # risk per trade: loss at stop <= max_risk_per_trade_frac * equity
        per_unit_loss = abs(px - order.stop_price)
        qty = min(qty, L.max_risk_per_trade_frac * eq / per_unit_loss)
        # position cap
        room_pos = L.max_position_notional_frac * eq / px - abs(cur)
        qty = min(qty, max(0.0, room_pos))
        # gross exposure cap
        gross = sum(abs(p.qty) * marks.get(s, p.avg_price) for s, p in acct.positions.items())
        room_gross = (L.max_gross_exposure_frac * eq - gross) / px
        qty = min(qty, max(0.0, room_gross))
        # spot paper: cannot spend cash we do not have
        if order.side == Side.BUY and cur >= 0:
            qty = min(qty, max(0.0, acct.cash) / (px * 1.01))

        qty = M.round_qty(qty)
        if qty <= 0 or qty * px < 10:   # dust / less than one share
            return Verdict(False, 0.0, "clipped to dust by limits")
        self._order_times.append(now_ms)
        return Verdict(True, qty, "ok" if qty == order.qty else f"clipped {order.qty:.6g}->{qty:.6g}")
