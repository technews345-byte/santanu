"""Offline tests for the Yahoo adapter: no network, a hand-built response in Yahoo's chart shape."""
import json
from datetime import datetime
from pathlib import Path

import pytest

from tradeagent.cli import build_agent, drive, recorded_events
from tradeagent.yahoo import (YahooDataError, bars_to_events, parse_bars, write_events,
                              yahoo_symbol)

from conftest import ScriptedJudge

ROOT = Path(__file__).resolve().parents[1]
MON_0915 = int(datetime.fromisoformat("2026-11-30T09:15:00+05:30").timestamp())


def chart(rows, error=None):
    ts, o, h, l, c, v = (list(x) for x in zip(*rows)) if rows else ([],) * 6
    return {"chart": {"error": error, "result": None if error else [{
        "meta": {"symbol": "NIFTYBEES.NS", "currency": "INR"}, "timestamp": ts,
        "indicators": {"quote": [{"open": o, "high": h, "low": l, "close": c, "volume": v}]}}]}}


def session(n=375, start_px=292.0):
    rows, px = [], start_px
    for m in range(n):
        o = px
        px = px * (1 + (0.0004 if m % 2 else -0.0003))
        rows.append((MON_0915 + 60 * m, o, max(o, px) * 1.0002, min(o, px) * 0.9998, px, 1000))
    return rows


def test_symbol_mapping():
    assert yahoo_symbol("NIFTYBEES", "nse_equity_intraday") == "NIFTYBEES.NS"
    assert yahoo_symbol("ONGC.NS", "nse_equity_intraday") == "ONGC.NS"
    assert yahoo_symbol("BTCUSDT", "crypto_spot") == "BTC-USD"
    assert yahoo_symbol("ETHUSD", "crypto_spot") == "ETH-USD"


def test_parse_drops_bad_bars_and_repairs_high_low():
    rows = [(MON_0915, 100, 101, 99, 100.5, 10),
            (MON_0915 + 60, None, 1, 1, 1, 1),            # missing open
            (MON_0915 + 120, 100, 100.2, 99.9, -5, 1),     # negative close
            (MON_0915, 100, 101, 99, 100, 1),              # duplicate timestamp: not after last kept
            (MON_0915 + 180, 100, 99.5, 100.4, 100.2, None)]  # high < open, low > close
    _, bars = parse_bars(chart(rows))
    assert [b[0] for b in bars] == [MON_0915, MON_0915 + 180]
    t, o, h, l, c, v = bars[1]
    assert h >= max(o, c) and l <= min(o, c) and v == 0


def test_parse_rejects_error_and_empty():
    with pytest.raises(YahooDataError):
        parse_bars(chart([], error={"code": "Not Found"}))
    with pytest.raises(YahooDataError):
        parse_bars({"nope": 1})
    with pytest.raises(YahooDataError):
        parse_bars(chart([(MON_0915, None, None, None, None, None)]))


def test_events_follow_bar_path_once_per_second():
    up = [(MON_0915, 100.0, 102.0, 99.0, 101.0, 600)]
    ev = list(bars_to_events("X", up))
    books = [e for e in ev if e["type"] == "book"]
    trades = [e for e in ev if e["type"] == "trade"]
    assert len(books) == 60 and len(trades) == 60
    assert [b["ts_ms"] for b in books] == [MON_0915 * 1000 + 1000 * s for s in range(60)]
    mids = [(b["bids"][0][0] + b["asks"][0][0]) / 2 for b in books]
    assert mids[0] == pytest.approx(100.0) and mids[-1] == pytest.approx(101.0)
    assert mids.index(min(mids)) < mids.index(max(mids))          # up bar: low before high
    assert min(mids) == pytest.approx(99.0) and max(mids) == pytest.approx(102.0)
    assert sum(t["size"] for t in trades) == pytest.approx(600)
    assert all(b["bids"][0][0] < b["asks"][0][0] for b in books)


def test_down_bar_visits_high_before_low():
    ev = [e for e in bars_to_events("X", [(MON_0915, 100.0, 101.0, 98.0, 99.0, 0)]) if e["type"] == "book"]
    mids = [(b["bids"][0][0] + b["asks"][0][0]) / 2 for b in ev]
    assert mids.index(max(mids)) < mids.index(min(mids))


def test_converted_data_replays_and_can_trade(tmp_path):
    """The converted feed must pass the risk layer's staleness check, session rules and flat-by."""
    _, bars = parse_bars(chart(session()))
    path = tmp_path / "NIFTYBEES.jsonl"
    write_events(path, bars_to_events("NIFTYBEES", bars))
    agent = build_agent(str(ROOT / "schemas" / "nifty-earnings.v1.json"), tmp_path / "run", "baseline")
    agent.judge = ScriptedJudge(direction="long", p_dir=0.9, q=3)
    drive(agent, recorded_events(str(path), "NIFTYBEES"))
    ev = [json.loads(l) for l in open(tmp_path / "run" / "journal.jsonl")]
    assert not [e for e in ev if e["kind"] == "risk" and "stale" in e["verdict"]["reason"]]
    assert any(e["kind"] == "fill" and e["why"] == "entry" for e in ev)
    assert not agent.acct.positions
