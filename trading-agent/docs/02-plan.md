# Build plan: six phases, one operator gate each

**About AgenKit.** The brief asks for this build to run through AgenKit (agenkit.xyz). From this build environment `agenkit.xyz` **did not resolve (DNS failure)**, and web search found no page for it, so I could not install it or confirm its phase names or commands. I did not install anything unverified into Claude Code. The plan below uses the six phases the brief names (spec, architecture, plan, test-first build, review, ship) with a gate after each. If you install AgenKit yourself, point it at `docs/00-spec.md` and map its phases onto this table; the files and gates stay the same.

| # | Phase | Deliverables (exact paths) | Status | Gate (operator approves) |
|---|---|---|---|---|
| 1 | Spec | `docs/00-spec.md`, `docs/03-research-crypto-2026-11-28.md`, `docs/04-research-india-2026-11-28.md` | done | **G1:** spec, regime calls and finalists accepted |
| 2 | Architecture | `docs/01-architecture.md`, `src/tradeagent/markets.py` (market split) | done | **G2:** architecture accepted; **Jev contract verified**: get a key from TypeSafe, check the endpoint, request and response shape against the official docs, adjust `judge.py::HttpJevClient.build_request/map_response` (both marked UNVERIFIED) |
| 3 | Plan | this file; `schemas/*.v1.json` (11 compiled finalists) | done | **G3:** schemas and limits in `src/tradeagent/config.py` accepted |
| 4 | Test-first build | `tests/test_state_engine.py`, `tests/test_schema_policy.py`, `tests/test_risk_markets.py`, `tests/test_loop_review.py`; code in `src/tradeagent/{state_engine,jev_schema,judge,policy,risk,markets,broker,loop,escalation,journal,review,sim,cli}.py` | done: 44 tests pass | **G4:** test suite and code review accepted |
| 5 | Review (evidence) | ≥30 days of **recorded** order-book data per symbol replayed with `tradeagent replay`; nightly reports under `state/<sym>/reviews/`; a live-broker adapter `src/tradeagent/broker_live.py` (not written), with reduce-only flatten, testnet (crypto) or paper (Kite) dry run | **not started** | **G5:** judge Brier < baseline and < uniform over ≥200 scored candles; ≥100 paper trades; P&L positive **after measured** slippage; max paper drawdown < 10%; venue, API keys, static IP (India) and order types chosen and tested |
| 6 | Ship | systemd/cron units for `step` and nightly `review`; secrets in the environment; a kill switch reachable from your phone (touch `state/<sym>/KILL`) | **not started** | **G6:** start live at ≤5% of intended capital; schema promotions to live need `promote --live --approve`; scale up only after 30 live days match paper within tolerance |

## Commands
```bash
cd trading-agent
python -m pytest -q
PYTHONPATH=src python -m tradeagent.cli paper  --schema schemas/btc-capitulation.v1.json --start 2026-11-28T00:00:00+00:00 --minutes 2880 --run state/btc
PYTHONPATH=src python -m tradeagent.cli paper  --schema schemas/nifty-earnings.v1.json  --start 2026-11-30T09:15:00+05:30 --minutes 375  --run state/nifty
PYTHONPATH=src python -m tradeagent.cli review --schema schemas/btc-capitulation.v1.json --run state/btc
# with a key:  export TYPESAFE_API_KEY=...; add --judge jev
# Opus escalations / review rewrites:  pip install anthropic; export TRADEAGENT_ESCALATE_TO_OPUS=1 TRADEAGENT_REVIEW_WITH_OPUS=1
```
