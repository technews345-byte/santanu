import dataclasses

import pytest

from tradeagent.config import GateConfig, RiskLimits
from tradeagent.jev_schema import JevSchema, JudgeOutputError, parse_decision
from tradeagent.policy import Calibrator, SetupParams, decide, kelly_fraction

from conftest import make_raw

SNAP = {"mid": 100.0, "rv60_bps": 10.0, "spr_bps": 2.0, "age_ms": 0}


def run(schema, cost_bps=16.0, has_pos=False, side=0, allow_short=False, **kw):
    d = parse_decision(schema, make_raw(**kw), 1.0)
    return decide(d, SNAP, has_pos, side, GateConfig(), RiskLimits(), cost_bps, 2.0,
                  SetupParams(), Calibrator(), allow_short)


# ---- schema validation --------------------------------------------------------------------
def test_parse_rejects_off_schema_value(btc_schema):
    raw = make_raw()
    raw["fields"]["regime"]["value"] = "bullish"
    with pytest.raises(JudgeOutputError):
        parse_decision(btc_schema, raw, 1)


def test_parse_rejects_bad_probabilities(btc_schema):
    raw = make_raw()
    raw["fields"]["direction"]["probs"] = {"long": 0.9, "short": 0.5, "neutral": 0.1}
    with pytest.raises(JudgeOutputError):
        parse_decision(btc_schema, raw, 1)


def test_parse_rejects_value_that_is_not_argmax(btc_schema):
    raw = make_raw(direction="long", p_dir=0.2)
    with pytest.raises(JudgeOutputError):
        parse_decision(btc_schema, raw, 1)


def test_schema_cannot_drop_or_retype_required_fields(btc_schema):
    fields = tuple(f for f in btc_schema.fields if f.name != "risk_state")
    with pytest.raises(ValueError):
        dataclasses.replace(btc_schema, fields=fields)


# ---- gates --------------------------------------------------------------------------------
def test_enters_when_all_gates_pass(btc_schema):
    i = run(btc_schema, p_dir=0.92, q=3)
    assert i.kind == "enter" and i.side == "buy"
    assert i.stop_price < 100 < i.target_price


@pytest.mark.parametrize("kw,gate", [
    ({"p_dir": 0.80}, "p_dir"),              # must be strictly above 0.80
    ({"q": 1}, "setup_quality"),
    ({"risk": "near_limit"}, "risk_state"),
    ({"toxic": True}, "toxic_flow"),
    ({"direction": "short"}, "short_disabled"),
])
def test_each_gate_blocks(btc_schema, kw, gate):
    base = {"p_dir": 0.92, "q": 3}
    i = run(btc_schema, **(base | kw))
    assert i.kind == "hold"
    assert any(g.startswith(gate) for g in i.failed_gates)


def test_crisis_escalates_and_exits_open_position(btc_schema):
    i = run(btc_schema, regime="crisis", has_pos=True, side=1)
    assert i.escalate and i.kind == "exit"


def test_low_confidence_escalates_without_trading(btc_schema):
    i = run(btc_schema, p_dir=0.55, direction="neutral")
    assert i.escalate and i.kind == "hold"


def test_high_costs_block_entry(btc_schema):
    i = run(btc_schema, cost_bps=200.0, p_dir=0.92)
    assert i.kind == "hold" and "edge_vs_cost" in i.failed_gates


# ---- sizing -------------------------------------------------------------------------------
def test_size_never_exceeds_quarter_kelly_or_risk_cap(btc_schema):
    i = run(btc_schema, p_dir=0.99, q=3)
    assert i.kind == "enter"
    assert i.risk_frac <= 0.25 * i.kelly_full + 1e-12
    assert i.risk_frac <= RiskLimits().max_risk_per_trade_frac


def test_kelly_cap_enforced_in_config():
    with pytest.raises(ValueError):
        GateConfig(kelly_multiplier=0.5)
    with pytest.raises(ValueError):
        GateConfig(min_direction_conf=0.7, min_setup_quality=1)


def test_kelly_formula():
    assert kelly_fraction(0.6, 1.0) == pytest.approx(0.2)
    assert kelly_fraction(0.3, 1.0) < 0


def test_calibration_table_can_only_lower_probability():
    c = Calibrator(haircut=0.05, table=[(0.82, 0.95), (0.97, 0.99)])
    assert c(0.9) == pytest.approx(0.5 + 0.4 * 0.95)       # table says higher -> ignored
    c2 = Calibrator(haircut=0.05, table=[(0.82, 0.55), (0.97, 0.60)])
    assert c2(0.9) < 0.6
