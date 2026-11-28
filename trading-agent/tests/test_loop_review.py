import json
from pathlib import Path

import pytest

from tradeagent.broker import PaperBroker
from tradeagent.escalation import QueueEscalator
from tradeagent.journal import Journal
from tradeagent.loop import Agent, AgentConfig
from tradeagent.markets import CRYPTO_SPOT, NSE_EQUITY_INTRADAY
from tradeagent.models import Account
from tradeagent.review import brier_multiclass, propose_calibration, propose_schema, review
from tradeagent.risk import KillSwitch, RiskEngine
from tradeagent.state_engine import StateEngine
from tradeagent.jev_schema import load_schema

from conftest import ScriptedJudge, book
from test_risk_markets import ist_ms

T0 = 1_764_288_000_000


def make_agent(tmp_path, schema, judge, market=CRYPTO_SPOT, cash=10_000.0):
    acct = Account(cash=cash, peak_equity=cash, day_start_equity=cash)
    j = Journal(tmp_path / "journal.jsonl")
    cfg = AgentConfig(market=market)
    return Agent(schema, StateEngine(schema.symbol), judge, PaperBroker(acct, market), acct,
                 RiskEngine(cfg.limits, KillSwitch(tmp_path / "KILL"), market),
                 QueueEscalator(j), j, cfg)


def run_path(agent, prices, start=T0):
    for m, px in enumerate(prices):
        ts = start + m * 60_000
        agent.on_book(book(agent.symbol, ts, px))
        agent.step(ts)
    return agent


def kinds(path):
    return [json.loads(l)["kind"] for l in open(path)]


def test_entry_then_stop_then_review(tmp_path, btc_schema):
    a = make_agent(tmp_path, btc_schema, ScriptedJudge(p_dir=0.93, q=3))
    wiggle = [100 * (1 + 0.0004 * ((-1) ** m)) for m in range(70)]           # builds rv60
    crash = [99.0 - i for i in range(15)]                                     # hits the stop
    run_path(a, wiggle + crash)
    fills = [json.loads(l) for l in open(tmp_path / "journal.jsonl") if '"kind":"fill"' in l]
    assert any(f["why"] == "entry" for f in fills)
    assert any(f["why"] == "stop_or_target" for f in fills)
    r = review(tmp_path / "journal.jsonl", horizon_min=5)
    assert r["trades"]["n"] >= 1 and r["trades"]["pnl"] < 0


def test_drawdown_in_loop_trips_kill_switch_and_flattens(tmp_path, btc_schema):
    from tradeagent.models import Position
    a = make_agent(tmp_path, btc_schema, ScriptedJudge(p_dir=0.93, q=3))
    a.acct.positions["BTCUSDT"] = Position("BTCUSDT", qty=100, avg_price=100)   # inherited, no stop
    a.acct.cash = 0.0
    run_path(a, [100.0] * 5 + [84.0] * 3)                                       # -16% equity
    assert a.risk.kill.tripped
    assert "halt" in kinds(tmp_path / "journal.jsonl")
    assert not a.acct.positions, "kill switch must flatten"
    run_path(a, [84.0] * 70, start=T0 + 10 * 60_000)                           # stays halted
    ev = [json.loads(l) for l in open(tmp_path / "journal.jsonl")]
    assert not [e for e in ev if e["kind"] == "fill" and e["why"] == "entry"]


def test_crisis_regime_escalates_and_pauses(tmp_path, btc_schema):
    a = make_agent(tmp_path, btc_schema, ScriptedJudge(regime="crisis", p_dir=0.93, q=3))
    run_path(a, [100.0] * 70)
    k = kinds(tmp_path / "journal.jsonl")
    assert "escalation" in k and "fill" not in k


def test_judge_failure_holds(tmp_path, btc_schema):
    class Broken:
        def decide(self, schema, snap):
            from tradeagent.jev_schema import JudgeOutputError
            raise JudgeOutputError("garbage")
    a = make_agent(tmp_path, btc_schema, Broken())
    run_path(a, [100.0] * 70)
    k = kinds(tmp_path / "journal.jsonl")
    assert "judge_error" in k and "fill" not in k


def test_nse_flattens_at_flat_by_and_respects_window(tmp_path, nifty_schema):
    a = make_agent(tmp_path, nifty_schema, ScriptedJudge(p_dir=0.93, q=3),
                   market=NSE_EQUITY_INTRADAY, cash=1_000_000.0)
    start = ist_ms("2026-11-30T09:15")
    prices = [256 * (1 + 0.0004 * ((-1) ** m)) for m in range(370)]
    run_path(a, prices, start)
    ev = [json.loads(l) for l in open(tmp_path / "journal.jsonl")]
    entries = [e for e in ev if e["kind"] == "fill" and e["why"] == "entry"]
    assert entries, "should enter inside the window"
    for e in entries:
        assert ist_ms("2026-11-30T09:30") <= e["ts"] <= ist_ms("2026-11-30T14:45")
        assert e["fill"]["qty"] == int(e["fill"]["qty"])
    assert not a.acct.positions, "must be flat after 15:15 IST"


def test_brier_values():
    assert brier_multiclass({"long": 1, "short": 0, "neutral": 0}, "long") == 0
    assert brier_multiclass({"long": 0, "short": 1, "neutral": 0}, "long") == 2


def test_calibration_needs_enough_trades():
    assert propose_calibration([{"p_raw": 0.9, "win": 1}] * 5) is None


def test_candidate_schema_keeps_required_fields(tmp_path, btc_schema):
    p = propose_schema(btc_schema, {"verdict": "x"}, tmp_path)
    s = load_schema(p)
    assert s.version == btc_schema.version + 1 and s.market == btc_schema.market
