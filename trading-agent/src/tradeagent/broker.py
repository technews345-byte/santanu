"""Brokers. PaperBroker is the default and the only one implemented.

PaperBroker fills marketable orders at the touch plus slippage, charges taker fees, and manages
each position's protective stop and target on every book update. When one bar could have hit
both, it assumes the STOP filled first (pessimistic). A live broker is deliberately not shipped:
choosing a venue, keys and order types is operator gate G5 (docs/02-plan.md).
"""
from __future__ import annotations

import itertools
from typing import Protocol

from .markets import MarketProfile
from .models import Account, Fill, Order, OrderBook, Position, Side


class Broker(Protocol):
    def submit(self, order: Order, qty: float, book: OrderBook) -> Fill | None: ...
    def on_book(self, book: OrderBook) -> list[Fill]: ...


class PaperBroker:
    def __init__(self, account: Account, market: MarketProfile):
        self.acct = account
        self.market = market
        self._ids = itertools.count(1)

    def _fill(self, symbol: str, side: Side, qty: float, ref_px: float, ts: int, oid: str) -> Fill:
        slip = self.market.slippage_bps / 1e4
        px = ref_px * (1 + slip) if side == Side.BUY else ref_px * (1 - slip)
        fee = self.market.fee(side.value, qty * px)
        pos = self.acct.positions.setdefault(symbol, Position(symbol))
        signed = qty if side == Side.BUY else -qty
        new_qty = pos.qty + signed
        if pos.qty == 0 or (pos.qty > 0) == (signed > 0):          # open / add
            pos.avg_price = (pos.avg_price * abs(pos.qty) + px * qty) / abs(new_qty)
        elif abs(new_qty) < 1e-12:
            pos.avg_price, pos.stop_price, pos.target_price = 0.0, None, None
        pos.qty = 0.0 if abs(new_qty) < 1e-12 else new_qty
        self.acct.cash -= signed * px + fee
        if pos.qty == 0:
            del self.acct.positions[symbol]
        return Fill(oid, symbol, ts, side, qty, px, fee)

    def submit(self, order: Order, qty: float, book: OrderBook) -> Fill | None:
        ref = book.asks[0].price if order.side == Side.BUY else book.bids[0].price
        if order.limit_price is not None:
            if (order.side == Side.BUY and ref > order.limit_price) or \
               (order.side == Side.SELL and ref < order.limit_price):
                return None
        f = self._fill(order.symbol, order.side, qty, ref, book.ts_ms, order.order_id)
        pos = self.acct.positions.get(order.symbol)
        if pos and not order.reduce_only:
            pos.stop_price, pos.target_price = order.stop_price, order.target_price
        return f

    def on_book(self, book: OrderBook) -> list[Fill]:
        pos = self.acct.positions.get(book.symbol)
        if not pos or pos.stop_price is None:
            return []
        bid, ask = book.bids[0].price, book.asks[0].price
        oid = f"paper-exit-{next(self._ids)}"
        if pos.qty > 0:
            if bid <= pos.stop_price:          # stop checked first: pessimistic
                return [self._fill(book.symbol, Side.SELL, pos.qty, bid, book.ts_ms, oid + "-stop")]
            if pos.target_price and bid >= pos.target_price:
                return [self._fill(book.symbol, Side.SELL, pos.qty, bid, book.ts_ms, oid + "-tgt")]
        else:
            if ask >= pos.stop_price:
                return [self._fill(book.symbol, Side.BUY, -pos.qty, ask, book.ts_ms, oid + "-stop")]
            if pos.target_price and ask <= pos.target_price:
                return [self._fill(book.symbol, Side.BUY, -pos.qty, ask, book.ts_ms, oid + "-tgt")]
        return []
