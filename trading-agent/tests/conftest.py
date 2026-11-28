import json
from pathlib import Path

import pytest

from tradeagent.jev_schema import load_schema, parse_decision
from tradeagent.models import BookLevel, OrderBook

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture
def btc_schema():
    return load_schema(ROOT / "schemas" / "btc-capitulation.v1.json")


@pytest.fixture
def nifty_schema():
    return load_schema(ROOT / "schemas" / "nifty-earnings.v1.json")


def book(symbol, ts, mid, half_spread_frac=0.0001, size=5.0):
    h = mid * half_spread_frac
    return OrderBook(symbol, ts,
                     tuple(BookLevel(mid - h - i * mid * 1e-4, size) for i in range(10)),
                     tuple(BookLevel(mid + h + i * mid * 1e-4, size) for i in range(10)))


def make_raw(regime="trending", direction="long", p_dir=0.9, toxic=False, q=3, risk="safe"):
    def dist(opts, win, p):
        rest = (1 - p) / (len(opts) - 1)
        return {str(o) if not isinstance(o, bool) else ("true" if o else "false"): (p if o == win else rest)
                for o in opts}
    return {"fields": {
        "regime": {"value": regime, "probs": dist(["trending", "mean_reverting", "high_vol", "crisis"], regime, 0.7)},
        "direction": {"value": direction, "probs": dist(["long", "short", "neutral"], direction, p_dir)},
        "toxic_flow": {"value": toxic, "probs": dist([True, False], toxic, 0.8)},
        "setup_quality": {"value": q, "probs": dist([0, 1, 2, 3], q, 0.7)},
        "risk_state": {"value": risk, "probs": dist(["safe", "near_limit", "reduce"], risk, 0.8)},
    }}


class ScriptedJudge:
    """Returns whatever decision the test sets; lets tests drive every branch of the loop."""

    def __init__(self, **kw):
        self.kw = kw

    def decide(self, schema, snapshot):
        return parse_decision(schema, make_raw(**self.kw), 1.0)
