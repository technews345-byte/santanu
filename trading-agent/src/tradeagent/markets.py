"""Market profiles: what differs between crypto and Indian equities, kept in one place.

The state engine, judge, policy, risk layer and review are shared. A MarketProfile answers:
  * may I open a position now?          (session, entry window, holidays)
  * must I be flat now?                 (NSE: flat-by 15:15 IST, ahead of the broker's MIS square-off)
  * what does a fill cost?              (crypto: bps fee; NSE: Zerodha intraday charge schedule)
  * how is quantity rounded?            (crypto: fractional; NSE cash: whole shares)
  * order-rate ceilings                 (NSE: SEBI retail-algo framework; stay far below 10 orders/sec)

NSE calendar: 2026 equity holidays as listed in NSE's circular (same list the day-trader-india
plugin ships). For a year with no holiday list, can_enter() returns False: fail closed rather
than trade on a holiday. Load next year's list before the first session of 2027.

Charges: Zerodha equity intraday schedule as of the build date (brokerage 0.03% or Rs 20 per
executed order, whichever is lower; STT 0.025% sell side; NSE transaction 0.00297%; SEBI Rs 10
per crore; stamp duty 0.003% buy side; GST 18% on brokerage + transaction + SEBI). Rates
change: verify against Zerodha's brokerage calculator at gate G5.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

IST = timezone(timedelta(hours=5, minutes=30))

NSE_HOLIDAYS: dict[int, frozenset[str]] = {
    2026: frozenset({
        "2026-01-15", "2026-01-26", "2026-03-03", "2026-03-26", "2026-03-31", "2026-04-03",
        "2026-04-14", "2026-05-01", "2026-05-28", "2026-06-26", "2026-09-14", "2026-10-02",
        "2026-10-20", "2026-11-10", "2026-11-24", "2026-12-25",
    }),
}


def _hm(s: str) -> int:
    h, m = s.split(":")
    return int(h) * 60 + int(m)


@dataclass(frozen=True)
class MarketProfile:
    name: str
    currency: str
    always_open: bool
    whole_units: bool
    allow_overnight: bool
    allow_short: bool                   # crypto spot: False; NSE cash: intraday only, off by default
    taker_fee_bps: float = 0.0          # crypto
    slippage_bps: float = 3.0
    max_orders_per_second: int = 5
    open_hm: str = "00:00"
    close_hm: str = "23:59"
    entry_start_hm: str = "00:00"
    entry_end_hm: str = "23:59"
    flat_by_hm: str | None = None
    holidays: dict[int, frozenset[str]] = field(default_factory=dict)
    circuit_buffer_frac: float = 0.01   # do not open within 1% of a price band

    # ---- time ------------------------------------------------------------------------------
    def _local(self, ts_ms: int) -> datetime:
        return datetime.fromtimestamp(ts_ms / 1000, tz=IST if not self.always_open else timezone.utc)

    def is_trading_day(self, ts_ms: int) -> bool:
        if self.always_open:
            return True
        t = self._local(ts_ms)
        hol = self.holidays.get(t.year)
        if hol is None:
            return False                                # unknown calendar -> closed
        return t.weekday() < 5 and t.strftime("%Y-%m-%d") not in hol

    def _minute(self, ts_ms: int) -> int:
        t = self._local(ts_ms)
        return t.hour * 60 + t.minute

    def is_open(self, ts_ms: int) -> bool:
        if self.always_open:
            return True
        return self.is_trading_day(ts_ms) and _hm(self.open_hm) <= self._minute(ts_ms) < _hm(self.close_hm)

    def can_enter(self, ts_ms: int) -> bool:
        if self.always_open:
            return True
        return self.is_open(ts_ms) and _hm(self.entry_start_hm) <= self._minute(ts_ms) <= _hm(self.entry_end_hm)

    def must_flatten(self, ts_ms: int) -> bool:
        if self.allow_overnight or self.flat_by_hm is None:
            return False
        return self.is_trading_day(ts_ms) and self._minute(ts_ms) >= _hm(self.flat_by_hm)

    def trading_day_key(self, ts_ms: int) -> str:
        return self._local(ts_ms).strftime("%Y-%m-%d")

    # ---- costs -----------------------------------------------------------------------------
    def fee(self, side: str, notional: float) -> float:
        """Charges for ONE executed order (one side)."""
        return abs(notional) * self.taker_fee_bps / 1e4

    def round_trip_cost_bps(self, notional: float) -> float:
        n = max(abs(notional), 1.0)
        return (self.fee("buy", n) + self.fee("sell", n)) / n * 1e4 + 2 * self.slippage_bps

    def round_qty(self, qty: float) -> float:
        return float(math.floor(qty)) if self.whole_units else qty

    def circuit_ok(self, price: float, lower: float | None, upper: float | None) -> bool:
        if lower is None or upper is None:
            return True
        return lower * (1 + self.circuit_buffer_frac) < price < upper * (1 - self.circuit_buffer_frac)


@dataclass(frozen=True)
class ZerodhaIntraday(MarketProfile):
    brokerage_pct: float = 0.03
    brokerage_cap_inr: float = 20.0
    stt_sell_pct: float = 0.025
    txn_pct: float = 0.00297
    sebi_per_crore: float = 10.0
    stamp_buy_pct: float = 0.003
    gst_pct: float = 18.0

    def fee(self, side: str, notional: float) -> float:
        v = abs(notional)
        brk = min(self.brokerage_cap_inr, v * self.brokerage_pct / 100)
        txn = v * self.txn_pct / 100
        sebi = v * self.sebi_per_crore / 1e7
        stt = v * self.stt_sell_pct / 100 if side == "sell" else 0.0
        stamp = v * self.stamp_buy_pct / 100 if side == "buy" else 0.0
        gst = (brk + txn + sebi) * self.gst_pct / 100
        return brk + txn + sebi + stt + stamp + gst


CRYPTO_SPOT = MarketProfile(
    name="crypto_spot", currency="USD", always_open=True, whole_units=False,
    allow_overnight=True, allow_short=False, taker_fee_bps=5.0, slippage_bps=3.0,
    max_orders_per_second=5,
)

NSE_EQUITY_INTRADAY = ZerodhaIntraday(
    name="nse_equity_intraday", currency="INR", always_open=False, whole_units=True,
    allow_overnight=False, allow_short=False, slippage_bps=3.0,
    max_orders_per_second=1,            # SEBI generic-algo threshold is 10/s; stay an order of magnitude below
    open_hm="09:15", close_hm="15:30", entry_start_hm="09:30", entry_end_hm="14:45",
    flat_by_hm="15:15", holidays=NSE_HOLIDAYS,
)

PROFILES = {p.name: p for p in (CRYPTO_SPOT, NSE_EQUITY_INTRADAY)}
