"""Command line.

  python -m tradeagent.cli paper    --schema schemas/btc-capitulation.v1.json --minutes 2880 --run state/btc
  python -m tradeagent.cli paper    --schema schemas/nifty-earnings.v1.json --start 2026-11-30T09:15+05:30 --minutes 375 --run state/nifty
  python -m tradeagent.cli fetch-yahoo --schema schemas/nifty-earnings.v1.json --out data/NIFTYBEES.jsonl [--range 5d]
  python -m tradeagent.cli replay   --schema ... --events recorded.jsonl --run state/x
  python -m tradeagent.cli review   --schema ... --run state/x
  python -m tradeagent.cli evaluate --incumbent ... --candidate ... --run state/x     (needs a judge key)
  python -m tradeagent.cli promote  --candidate ... --eval state/x/eval.json [--live --approve]
  python -m tradeagent.cli reset-kill --run state/x --i-understand

There is no `live` command. Connecting a real broker is gate G5 in docs/02-plan.md.
"""
from __future__ import annotations

import argparse
import json
import shutil
import statistics
import sys
from datetime import datetime, timezone
from pathlib import Path

from .broker import PaperBroker
from .escalation import make_escalator
from .jev_schema import JudgeOutputError, load_schema
from .journal import Journal
from .judge import BaselineJudge, HttpJevClient, JudgeUnavailable
from .loop import Agent, AgentConfig
from .markets import PROFILES
from .models import Account, BookLevel, OrderBook, Trade
from .review import DIRS, MIN_EVAL_SAMPLES, brier_multiclass, direction_label, write_review
from .risk import KillSwitch, RiskEngine
from .sim import synthetic_events
from .state_engine import StateEngine


def _judge(name: str):
    if name == "jev":
        return HttpJevClient()
    return BaselineJudge()


def build_agent(schema_path: str, run: Path, judge: str, cash: float | None = None) -> Agent:
    schema = load_schema(schema_path)
    market = PROFILES[schema.market]
    run.mkdir(parents=True, exist_ok=True)
    cash = cash or (1_000_000.0 if market.currency == "INR" else 10_000.0)
    acct = Account(cash=cash, peak_equity=cash, day_start_equity=cash)
    journal = Journal(run / "journal.jsonl")
    cfg = AgentConfig(market=market)
    risk = RiskEngine(cfg.limits, KillSwitch(run / "KILL"), market)
    return Agent(schema, StateEngine(schema.symbol), _judge(judge), PaperBroker(acct, market),
                 acct, risk, make_escalator(journal), journal, cfg)


def drive(agent: Agent, events) -> dict:
    next_step = None
    n = 0
    for kind, ev in events:
        if next_step is None:
            next_step = (ev.ts_ms // 60_000 + 1) * 60_000
        while ev.ts_ms >= next_step:              # candle close: decide on data up to the close
            agent.step(next_step - 1)
            next_step += 60_000
            n += 1
        agent.on_book(ev) if kind == "book" else agent.on_trade(ev)
    mid = agent.engine.snapshot_mid(agent.book) if agent.book else 0
    return {"steps": n, "equity": agent.acct.equity({agent.symbol: mid}),
            "kill_tripped": agent.risk.kill.tripped}


def recorded_events(path: str, symbol: str):
    with open(path) as f:
        for line in f:
            d = json.loads(line)
            if d.get("symbol") != symbol:
                continue
            if d["type"] == "book":
                yield "book", OrderBook(symbol, int(d["ts_ms"]),
                                        tuple(BookLevel(float(p), float(s)) for p, s in d["bids"]),
                                        tuple(BookLevel(float(p), float(s)) for p, s in d["asks"]))
            elif d["type"] == "trade":
                yield "trade", Trade(symbol, int(d["ts_ms"]), float(d["price"]), float(d["size"]), d["aggressor"])


def cmd_paper(a) -> int:
    agent = build_agent(a.schema, Path(a.run), a.judge)
    start = int(datetime.fromisoformat(a.start).timestamp() * 1000)
    px = 25_600 / 100 if agent.cfg.market.currency == "INR" else 60_000.0
    res = drive(agent, synthetic_events(agent.symbol, start, a.minutes, start_px=px, seed=a.seed,
                                        crash_at_min=a.crash_at))
    print(json.dumps(res, indent=2))
    return 0


def cmd_replay(a) -> int:
    agent = build_agent(a.schema, Path(a.run), a.judge)
    print(json.dumps(drive(agent, recorded_events(a.events, agent.symbol)), indent=2))
    return 0


def cmd_fetch_yahoo(a) -> int:
    from .yahoo import YahooDataError, bars_to_events, fetch_chart, parse_bars, write_events, yahoo_symbol
    schema = load_schema(a.schema)
    ysym = a.yahoo_symbol or yahoo_symbol(schema.symbol, schema.market)
    try:
        body = fetch_chart(ysym, a.range)
        meta, bars = parse_bars(body)
    except (YahooDataError, OSError, ValueError) as e:
        print(f"fetch failed for {ysym}: {e}")
        return 1
    if a.raw_out:
        Path(a.raw_out).parent.mkdir(parents=True, exist_ok=True)
        Path(a.raw_out).write_text(json.dumps(body))
    n = write_events(a.out, bars_to_events(schema.symbol, bars))
    fmt = lambda t: datetime.fromtimestamp(t, timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    print(json.dumps({"symbol": schema.symbol, "yahoo_symbol": ysym, "currency": meta.get("currency"),
                      "bars": len(bars), "first_bar": fmt(bars[0][0]), "last_bar": fmt(bars[-1][0]),
                      "events": n, "out": a.out,
                      "note": "real prices; order-book depth and trade aggressor are approximated"}, indent=2))
    return 0


def cmd_review(a) -> int:
    run = Path(a.run)
    date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    r = write_review(run / "journal.jsonl", load_schema(a.schema), run / "reviews", "schemas/candidates", date)
    print(json.dumps({k: r[k] for k in ("verdict", "judge", "baseline", "candidate")}, indent=2, default=str))
    return 0


def cmd_evaluate(a) -> int:
    """Re-score the same journalled snapshots with incumbent and candidate schemas."""
    run = Path(a.run)
    inc, cand = load_schema(a.incumbent), load_schema(a.candidate)
    judge = _judge(a.judge)
    ev = [e for e in Journal(run / "journal.jsonl").read() if e["kind"] == "snapshot"]
    ts = [e["ts"] for e in ev]
    mids = [e["snap"]["mid"] for e in ev]
    import bisect
    scores = {"incumbent": [], "candidate": []}
    for i, e in enumerate(ev):
        j = bisect.bisect_left(ts, e["ts"] + 60 * 60_000)
        if j >= len(ts):
            break
        lab = direction_label((mids[j] / mids[i] - 1) * 1e4, 16.0)
        for name, s in (("incumbent", inc), ("candidate", cand)):
            try:
                d = judge.decide(s, e["snap"])
            except (JudgeUnavailable, JudgeOutputError):
                continue
            scores[name].append(brier_multiclass({k: d.direction.probs[k] for k in DIRS}, lab))
    out = {k: {"n": len(v), "brier": statistics.fmean(v) if v else None} for k, v in scores.items()}
    out["candidate_path"], out["incumbent_path"] = a.candidate, a.incumbent
    (run / "eval.json").write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps(out, indent=2))
    return 0


def cmd_promote(a) -> int:
    ev = json.loads(Path(a.eval).read_text())
    c, i = ev["candidate"], ev["incumbent"]
    if Path(ev["candidate_path"]).resolve() != Path(a.candidate).resolve():
        print("eval file is for a different candidate"); return 2
    if c["n"] < MIN_EVAL_SAMPLES or i["n"] < MIN_EVAL_SAMPLES:
        print(f"refused: need >= {MIN_EVAL_SAMPLES} scored samples each"); return 2
    if c["brier"] > i["brier"]:
        print(f"refused: candidate Brier {c['brier']:.4f} worse than incumbent {i['brier']:.4f}"); return 2
    if a.live and not a.approve:
        print("refused: live promotion needs --approve from the operator"); return 2
    load_schema(a.candidate)
    dest = Path("schemas") / Path(a.candidate).name
    shutil.copy(a.candidate, dest)
    tier = "live" if a.live else "paper"
    with open("schemas/PROMOTIONS.log", "a") as f:
        f.write(f"{datetime.now(timezone.utc).isoformat()} {tier} {dest} brier {c['brier']:.4f} vs {i['brier']:.4f}\n")
    print(f"promoted to {tier}: {dest}")
    return 0


def cmd_reset_kill(a) -> int:
    KillSwitch(Path(a.run) / "KILL").reset(operator_ack=a.i_understand)
    print("kill switch cleared")
    return 0


def main(argv=None) -> int:
    p = argparse.ArgumentParser(prog="tradeagent")
    sp = p.add_subparsers(dest="cmd", required=True)

    s = sp.add_parser("paper"); s.add_argument("--schema", required=True); s.add_argument("--run", required=True)
    s.add_argument("--minutes", type=int, default=1440); s.add_argument("--seed", type=int, default=7)
    s.add_argument("--start", default="2026-11-30T09:15:00+05:30"); s.add_argument("--crash-at", type=int)
    s.add_argument("--judge", choices=["baseline", "jev"], default="baseline"); s.set_defaults(f=cmd_paper)

    s = sp.add_parser("replay"); s.add_argument("--schema", required=True); s.add_argument("--run", required=True)
    s.add_argument("--events", required=True)
    s.add_argument("--judge", choices=["baseline", "jev"], default="baseline"); s.set_defaults(f=cmd_replay)

    s = sp.add_parser("fetch-yahoo", help="real 1-minute bars from Yahoo Finance -> replay events")
    s.add_argument("--schema", required=True); s.add_argument("--out", required=True)
    s.add_argument("--range", choices=["1d", "5d", "7d"], default="5d")
    s.add_argument("--yahoo-symbol", help="override the ticker derived from the schema (e.g. ^NSEI)")
    s.add_argument("--raw-out", help="also save Yahoo's raw JSON here"); s.set_defaults(f=cmd_fetch_yahoo)

    s = sp.add_parser("review"); s.add_argument("--schema", required=True); s.add_argument("--run", required=True)
    s.set_defaults(f=cmd_review)

    s = sp.add_parser("evaluate"); s.add_argument("--incumbent", required=True); s.add_argument("--candidate", required=True)
    s.add_argument("--run", required=True); s.add_argument("--judge", choices=["baseline", "jev"], default="jev")
    s.set_defaults(f=cmd_evaluate)

    s = sp.add_parser("promote"); s.add_argument("--candidate", required=True); s.add_argument("--eval", required=True)
    s.add_argument("--live", action="store_true"); s.add_argument("--approve", action="store_true")
    s.set_defaults(f=cmd_promote)

    s = sp.add_parser("reset-kill"); s.add_argument("--run", required=True)
    s.add_argument("--i-understand", action="store_true"); s.set_defaults(f=cmd_reset_kill)

    a = p.parse_args(argv)
    try:
        return a.f(a)
    except PermissionError as e:
        print(f"refused: {e}"); return 2


if __name__ == "__main__":
    sys.exit(main())
