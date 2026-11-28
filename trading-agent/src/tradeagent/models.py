from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Literal


class Side(str, Enum):
    BUY = "buy"
    SELL = "sell"


@dataclass(frozen=True)
class BookLevel:
    price: float
    size: float


@dataclass(frozen=True)
class OrderBook:
    symbol: str
    ts_ms: int                     # exchange timestamp of this book state
    bids: tuple[BookLevel, ...]    # best first
    asks: tuple[BookLevel, ...]    # best first


@dataclass(frozen=True)
class Trade:
    symbol: str
    ts_ms: int
    price: float
    size: float
    aggressor: Literal["buy", "sell"]


@dataclass(frozen=True)
class Fill:
    order_id: str
    symbol: str
    ts_ms: int
    side: Side
    qty: float
    price: float
    fee: float


@dataclass(frozen=True)
class Order:
    order_id: str
    symbol: str
    side: Side
    qty: float
    limit_price: float | None
    stop_price: float           # protective stop, required on every entry
    target_price: float
    reason: str
    reduce_only: bool = False


@dataclass
class Position:
    symbol: str
    qty: float = 0.0            # signed; >0 long
    avg_price: float = 0.0
    stop_price: float | None = None
    target_price: float | None = None


@dataclass
class Account:
    cash: float
    positions: dict[str, Position] = field(default_factory=dict)
    peak_equity: float = 0.0
    day_start_equity: float = 0.0
    day: str = ""

    def equity(self, marks: dict[str, float]) -> float:
        return self.cash + sum(p.qty * marks.get(s, p.avg_price) for s, p in self.positions.items())
