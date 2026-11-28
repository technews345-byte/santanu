"""Deterministic state engine: raw market data in, one compact numeric snapshot out.

Rules this module enforces:
  * Causality. A snapshot built "as of" time T only reads events with ts <= T. Any event with
    ts > T that reaches the builder raises CausalityError; events that arrive out of order
    (ts earlier than the last accepted one) are rejected too, so a replay cannot rewrite history.
  * All arithmetic (mid, spread, imbalance, realised vol, inventory, drawdown) happens here,
    never in the model. The model sees numbers, it does not compute them.
  * Size. The serialised snapshot must stay under SNAPSHOT_TOKEN_BUDGET tokens, estimated
    conservatively at 1 token per 3 characters of compact JSON. Exceeding it is an error,
    not a silent truncation.
  * Determinism. Same inputs -> byte-identical output (fixed key order, fixed rounding).
"""
from __future__ import annotations

import bisect
import json
import math
from collections import deque
from dataclasses import dataclass

from .models import Account, OrderBook, Trade

SNAPSHOT_TOKEN_BUDGET = 400
SCHEMA_VERSION = "snap/1"
_MIN = 60_000


class CausalityError(RuntimeError):
    pass


def estimate_tokens(text: str) -> int:
    # Conservative: numeric JSON tokenises at roughly 2.5-4 chars/token. Use 3.
    return math.ceil(len(text) / 3)


def _r(x: float | None, nd: int) -> float | None:
    if x is None or (isinstance(x, float) and (math.isnan(x) or math.isinf(x))):
        return None
    return round(x, nd)


@dataclass(frozen=True)
class ContextValue:
    value: float
    ts_ms: int


class StateEngine:
    """One engine per symbol. Feed it events in timestamp order; ask for snapshots."""

    def __init__(self, symbol: str, depth_levels: int = 10, history_ms: int = 4 * 60 * _MIN):
        self.symbol = symbol
        self.depth_levels = depth_levels
        self.history_ms = history_ms
        self._book: OrderBook | None = None
        self._mid_ts: list[int] = []
        self._mid_px: list[float] = []
        self._trades: deque[Trade] = deque()
        self._last_ts = -1
        self._context: dict[str, ContextValue] = {}

    # ---- ingestion -------------------------------------------------------------------------
    def _accept(self, ts_ms: int) -> None:
        if ts_ms < self._last_ts:
            raise CausalityError(f"out-of-order event ts={ts_ms} < last={self._last_ts}")
        self._last_ts = ts_ms

    def on_book(self, book: OrderBook) -> None:
        if book.symbol != self.symbol:
            raise ValueError("wrong symbol")
        if not book.bids or not book.asks:
            raise ValueError("empty side in book")
        if book.bids[0].price >= book.asks[0].price:
            raise ValueError("crossed book")
        self._accept(book.ts_ms)
        self._book = book
        mid = (book.bids[0].price + book.asks[0].price) / 2
        self._mid_ts.append(book.ts_ms)
        self._mid_px.append(mid)
        self._trim(book.ts_ms)

    def on_trade(self, trade: Trade) -> None:
        if trade.symbol != self.symbol:
            raise ValueError("wrong symbol")
        self._accept(trade.ts_ms)
        self._trades.append(trade)
        self._trim(trade.ts_ms)

    def on_context(self, name: str, value: float, ts_ms: int) -> None:
        """Slow context (funding, OI change, BTC dominance...). ts_ms = when it was PUBLISHED,
        not the period it describes, so a value is never used before it was knowable."""
        prev = self._context.get(name)
        if prev and ts_ms < prev.ts_ms:
            raise CausalityError(f"context {name} went back in time")
        self._context[name] = ContextValue(value, ts_ms)

    def _trim(self, now_ms: int) -> None:
        cutoff = now_ms - self.history_ms
        i = bisect.bisect_left(self._mid_ts, cutoff)
        if i > 0:
            del self._mid_ts[:i]
            del self._mid_px[:i]
        while self._trades and self._trades[0].ts_ms < cutoff:
            self._trades.popleft()

    # ---- features --------------------------------------------------------------------------
    def _mid_at(self, t_ms: int) -> float | None:
        i = bisect.bisect_right(self._mid_ts, t_ms) - 1
        return self._mid_px[i] if i >= 0 else None

    def _ret_bps(self, asof: int, lookback_ms: int) -> float | None:
        now, then = self._mid_at(asof), self._mid_at(asof - lookback_ms)
        if now is None or then is None:
            return None
        return (now / then - 1) * 1e4

    def _realised_vol_bps(self, asof: int, window_min: int) -> float | None:
        """Std-dev of 1-minute log returns over the window, in bps per minute."""
        pts = [self._mid_at(asof - k * _MIN) for k in range(window_min, -1, -1)]
        pts = [p for p in pts if p is not None]
        if len(pts) < 6:
            return None
        rets = [math.log(b / a) for a, b in zip(pts, pts[1:])]
        mu = sum(rets) / len(rets)
        var = sum((r - mu) ** 2 for r in rets) / (len(rets) - 1)
        return math.sqrt(var) * 1e4

    def _flow(self, asof: int, window_ms: int) -> tuple[float | None, float]:
        buy = sell = 0.0
        for t in reversed(self._trades):
            if t.ts_ms > asof:
                raise CausalityError("trade from the future reached the snapshot")
            if t.ts_ms < asof - window_ms:
                break
            if t.aggressor == "buy":
                buy += t.size * t.price
            else:
                sell += t.size * t.price
        tot = buy + sell
        return ((buy - sell) / tot if tot else None), tot

    # ---- snapshot --------------------------------------------------------------------------
    @staticmethod
    def snapshot_mid(book: OrderBook) -> float:
        return (book.bids[0].price + book.asks[0].price) / 2

    def snapshot(self, asof_ms: int, account: Account, marks: dict[str, float]) -> dict:
        b = self._book
        if b is None:
            raise RuntimeError("no book yet")
        if b.ts_ms > asof_ms or self._last_ts > asof_ms:
            raise CausalityError(f"engine holds data newer than asof ({self._last_ts} > {asof_ms})")

        bid, ask = b.bids[0].price, b.asks[0].price
        mid = (bid + ask) / 2
        spread_bps = (ask - bid) / mid * 1e4
        bd = sum(l.size for l in b.bids[: self.depth_levels])
        ad = sum(l.size for l in b.asks[: self.depth_levels])
        imbalance = (bd - ad) / (bd + ad) if bd + ad else 0.0
        b0, a0 = b.bids[0].size, b.asks[0].size
        micro = (bid * a0 + ask * b0) / (a0 + b0) if a0 + b0 else mid
        micro_bps = (micro / mid - 1) * 1e4

        flow_5m, notional_5m = self._flow(asof_ms, 5 * _MIN)
        flow_1m, _ = self._flow(asof_ms, _MIN)

        eq = account.equity(marks)
        pos = account.positions.get(self.symbol)
        pos_notional = (pos.qty * mid) if pos else 0.0
        peak = max(account.peak_equity, eq)
        dd = (peak - eq) / peak if peak > 0 else 0.0
        day_pnl = (eq / account.day_start_equity - 1) if account.day_start_equity else 0.0

        ctx = {}
        for k in sorted(self._context):
            cv = self._context[k]
            if cv.ts_ms <= asof_ms:                     # causal filter on slow data
                ctx[k] = _r(cv.value, 4)
                ctx[k + "_age_m"] = int((asof_ms - cv.ts_ms) / _MIN)

        snap = {
            "v": SCHEMA_VERSION,
            "sym": self.symbol,
            "asof": asof_ms,
            "src_ts": b.ts_ms,                          # newest input actually used
            "age_ms": asof_ms - b.ts_ms,
            "mid": _r(mid, 6),
            "spr_bps": _r(spread_bps, 2),
            "imb10": _r(imbalance, 3),
            "micro_bps": _r(micro_bps, 2),
            "r1m_bps": _r(self._ret_bps(asof_ms, _MIN), 1),
            "r15m_bps": _r(self._ret_bps(asof_ms, 15 * _MIN), 1),
            "r1h_bps": _r(self._ret_bps(asof_ms, 60 * _MIN), 1),
            "r4h_bps": _r(self._ret_bps(asof_ms, 240 * _MIN), 1),
            "rv15_bps": _r(self._realised_vol_bps(asof_ms, 15), 2),
            "rv60_bps": _r(self._realised_vol_bps(asof_ms, 60), 2),
            "flow1m": _r(flow_1m, 3),
            "flow5m": _r(flow_5m, 3),
            "vol5m_usd": _r(notional_5m, 0),
            "inv_qty": _r(pos.qty if pos else 0.0, 6),
            "inv_frac": _r(pos_notional / eq if eq else 0.0, 4),
            "dd": _r(dd, 4),
            "day_pnl": _r(day_pnl, 4),
            "ctx": ctx,
        }
        text = serialize(snap)
        if estimate_tokens(text) >= SNAPSHOT_TOKEN_BUDGET:
            raise ValueError(f"snapshot over budget: ~{estimate_tokens(text)} tokens")
        return snap


def serialize(snap: dict) -> str:
    return json.dumps(snap, separators=(",", ":"), sort_keys=False, allow_nan=False)
