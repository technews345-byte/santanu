"""Paper account size and risk-reward settings."""
import json
from datetime import datetime
from pathlib import Path

import pytest

from tradeagent.cli import build_agent, drive, main
from tradeagent.config import GateConfig, RiskLimits
from tradeagent.jev_schema import parse_decision
from tradeagent.policy import Calibrator, SetupParams, decide
from tradeagent.sim import synthetic_events

from conftest import ScriptedJudge, make_raw

ROOT = Path(__file__).resolve().parents[1]
NIFTY = str(ROOT / "schemas" / "nifty-earnings.v1.json")
SNAP = {"mid": 100.0, "rv60_bps": 10.0, "spr_bps": 2.0, "age_ms": 0}


def test_default_is_one_to_three():
    assert SetupParams().reward_risk == 3.0


@pytest.mark.parametrize("rr", [1.0, 3.0, 5.0])
def test_target_is_rr_times_stop_distance(btc_schema, rr):
    d = parse_decision(btc_schema, make_raw(p_dir=0.95, q=3), 1.0)
    i = decide(d, SNAP, False, 0, GateConfig(), RiskLimits(), 16.0, 2.0,
               SetupParams(reward_risk=rr), Calibrator(), False)
    assert i.kind == "enter"
    assert (i.target_price - 100) == pytest.approx(rr * (100 - i.stop_price))


@pytest.mark.parametrize("rr", [0.5, 0.0, 11.0])
def test_reward_risk_out_of_range_rejected(rr):
    with pytest.raises(ValueError):
        SetupParams(reward_risk=rr)


def test_default_nse_capital_is_one_lakh(tmp_path):
    a = build_agent(NIFTY, tmp_path, "baseline")
    assert a.acct.cash == 100_000 and a.initial_capital == 100_000
    cfg = json.loads(open(tmp_path / "journal.jsonl").readline())
    assert cfg["kind"] == "config" and cfg["capital"] == 100_000 and cfg["reward_risk"] == 3.0


def test_one_lakh_one_to_three_forced_session(tmp_path):
    """Rs 1 lakh, 1:3: every entry's target is 3x its stop, position <= 20% of equity, flat by 15:15."""
    a = build_agent(NIFTY, tmp_path, "baseline", cash=100_000, reward_risk=3.0)
    a.judge = ScriptedJudge(direction="long", p_dir=0.9, q=3)
    start = int(datetime.fromisoformat("2026-11-30T09:15:00+05:30").timestamp() * 1000)
    drive(a, synthetic_events("NIFTYBEES", start, 375, start_px=292.0, seed=11))
    ev = [json.loads(l) for l in open(tmp_path / "journal.jsonl")]
    risk = {e["order"]["order_id"]: e for e in ev if e["kind"] == "risk"}
    entries = [e for e in ev if e["kind"] == "fill" and e["why"] == "entry"]
    assert entries
    for e in entries:
        o = risk[e["fill"]["order_id"]]["order"]
        mid = e["decision_mid"]
        assert (o["target_price"] - mid) == pytest.approx(3 * (mid - o["stop_price"]), rel=1e-6)
        assert e["fill"]["qty"] * e["fill"]["price"] <= 0.20 * 100_000 * 1.05     # cap measured at entry equity
        assert e["fill"]["qty"] == int(e["fill"]["qty"])
    assert not a.acct.positions


def test_cli_flags(tmp_path, capsys):
    rc = main(["paper", "--schema", NIFTY, "--run", str(tmp_path / "r"), "--minutes", "30",
               "--capital", "250000", "--reward-risk", "4"])
    out = json.loads(capsys.readouterr().out)
    assert rc == 0 and out["capital"] == 250_000 and out["reward_risk"] == "1:4"
    assert main(["paper", "--schema", NIFTY, "--run", str(tmp_path / "bad"), "--minutes", "5",
                 "--reward-risk", "0.5"]) == 2
