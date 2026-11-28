import pytest

from tradeagent.models import Account, Trade
from tradeagent.state_engine import (SNAPSHOT_TOKEN_BUDGET, CausalityError, StateEngine,
                                     estimate_tokens, serialize)

from conftest import book

T0 = 1_764_288_000_000


def feed(engine, minutes=90, start=100.0):
    px = start
    for m in range(minutes):
        ts = T0 + m * 60_000
        px *= 1.0005 if m % 3 else 0.9995
        engine.on_book(book("X", ts, px))
        engine.on_trade(Trade("X", ts, px, 1.0, "buy" if m % 2 else "sell"))
    return T0 + (minutes - 1) * 60_000


def acct():
    return Account(cash=10_000, peak_equity=10_000, day_start_equity=10_000)


def test_snapshot_is_compact_and_has_core_fields():
    e = StateEngine("X")
    t = feed(e)
    s = e.snapshot(t, acct(), {"X": 100.0})
    for k in ("mid", "spr_bps", "imb10", "rv60_bps", "inv_frac", "dd"):
        assert k in s
    assert estimate_tokens(serialize(s)) < SNAPSHOT_TOKEN_BUDGET


def test_snapshot_is_deterministic():
    a, b = StateEngine("X"), StateEngine("X")
    ta, tb = feed(a), feed(b)
    assert serialize(a.snapshot(ta, acct(), {"X": 1})) == serialize(b.snapshot(tb, acct(), {"X": 1}))


def test_snapshot_refuses_asof_before_newest_data():
    e = StateEngine("X")
    t = feed(e)
    with pytest.raises(CausalityError):
        e.snapshot(t - 1, acct(), {"X": 100.0})


def test_out_of_order_event_rejected():
    e = StateEngine("X")
    t = feed(e, 10)
    with pytest.raises(CausalityError):
        e.on_book(book("X", t - 60_000, 100.0))


def test_context_published_after_asof_is_not_used():
    e = StateEngine("X")
    t = feed(e)
    e.on_context("funding", 0.0001, t - 60_000)
    e.on_context("btc_dom", 0.58, t + 3_600_000)        # published in the future
    ctx = e.snapshot(t, acct(), {"X": 100.0})["ctx"]
    assert "funding" in ctx and "btc_dom" not in ctx


def test_crossed_book_rejected():
    from tradeagent.models import BookLevel, OrderBook
    e = StateEngine("X")
    with pytest.raises(ValueError):
        e.on_book(OrderBook("X", T0, (BookLevel(101, 1),), (BookLevel(100, 1),)))
