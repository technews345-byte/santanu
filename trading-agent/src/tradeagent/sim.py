"""Synthetic market data for paper runs and tests. Seeded, so runs are reproducible.

This is plumbing, not evidence: P&L on synthetic data says nothing about edge. Real evaluation
replays recorded exchange data through the same Agent (see `tradeagent replay`).
"""
from __future__ import annotations

import math
import random
from typing import Iterator

from .models import BookLevel, OrderBook, Trade


def synthetic_events(symbol: str, start_ms: int, minutes: int, start_px: float = 100.0,
                     seed: int = 7, crash_at_min: int | None = None,
                     updates_per_min: int = 4) -> Iterator[tuple[str, object]]:
    rng = random.Random(seed)
    px = start_px
    drift, vol = 0.0, 0.0008
    step_ms = 60_000 // updates_per_min
    for m in range(minutes):
        if m % 120 == 0:                                   # new regime every 2h
            drift = rng.choice([-1, 0, 0, 1]) * 0.00015
            vol = rng.choice([0.0005, 0.0008, 0.0015])
        for k in range(updates_per_min):
            ts = start_ms + m * 60_000 + k * step_ms
            shock = drift / updates_per_min + vol / math.sqrt(updates_per_min) * rng.gauss(0, 1)
            if crash_at_min is not None and crash_at_min <= m < crash_at_min + 30:
                shock -= 0.004 / updates_per_min
            px *= math.exp(shock)
            half = px * rng.uniform(0.00005, 0.0003)
            bids = tuple(BookLevel(px - half - i * px * 0.0001, rng.uniform(1, 10)) for i in range(10))
            asks = tuple(BookLevel(px + half + i * px * 0.0001, rng.uniform(1, 10)) for i in range(10))
            yield "book", OrderBook(symbol, ts, bids, asks)
            side = "buy" if shock > 0 else "sell"
            yield "trade", Trade(symbol, ts, px, rng.uniform(0.1, 3.0) * (1 + abs(shock) * 500), side)
