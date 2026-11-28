# Architecture (phase 2)

```
 exchange / broker feed
        │ book + trade events (timestamped)
        ▼
 ┌──────────────────┐   snapshot (<400 tok, causal)   ┌────────────────────────┐
 │ StateEngine      │ ───────────────────────────────▶ │ Judge (Jev / Baseline) │
 │ state_engine.py  │                                  │ judge.py, jev_schema.py│
 └──────────────────┘                                  └───────────┬────────────┘
        ▲                                     Decision (5 typed fields + probs)
        │                                                          ▼
        │                                   ┌──────────────────────────────────┐
        │                                   │ Policy  policy.py                │
        │                                   │ escalate? gates? geometry, Kelly │
        │                                   └───────┬──────────────┬───────────┘
        │                         Intent(enter/exit) │              │ escalate
        │                                            ▼              ▼
        │              ┌───────────────────────────────┐   ┌──────────────────────┐
        │              │ RiskEngine  risk.py           │   │ Escalator            │
        │              │ sees Order + Account + market │   │ escalation.py (Opus) │
        │              │ facts ONLY, never model output│   │ hold/flatten/resume  │
        │              └───────────────┬───────────────┘   └──────────────────────┘
        │                    approved qty │
        │                                 ▼
        │              ┌───────────────────────────────┐
        └──────────────│ Broker  broker.py (paper)     │  stops/targets on every book update
                       └───────────────┬───────────────┘
                                       ▼
                       Journal (journal.py, append-only JSONL)
                                       ▼  nightly
                       Review (review.py): Brier, reliability, misses, slippage,
                       calibration table, candidate schema → evaluate → promote (gated)
```

`MarketProfile` (`markets.py`) is injected into the risk engine, broker and loop; it is the only place crypto and NSE differ.

## Key decisions
- **Risk isolation is structural, not a convention.** `RiskEngine.check` has no parameter that could carry model output; `tests/test_risk_markets.py::test_risk_check_has_no_access_to_model_output` keeps it that way. Limits are frozen dataclasses, and `RiskLimits` refuses a drawdown above 15%.
- **Fail closed everywhere.** A judge timeout, bad JSON, off-schema value, probabilities that don't sum to 1, a value that isn't the argmax, a causality violation, stale data, a missing holiday calendar or a failed escalation call all mean HOLD, logged.
- **Direction confidence is not win probability.** Kelly needs P(target before stop). The `Calibrator` maps raw direction probability to empirical win rate once ≥30 trades exist, and until then shaves 5% of the distance to 0.5. It applies `min(haircut, table)`, so learning can only shrink sizes automatically.
- **Costs are in the gate.** Expected edge must be ≥2× round-trip cost from the market profile (crypto: fee + slippage bps; NSE: the full Zerodha schedule).
- **Shadow baseline.** Every candle also runs `BaselineJudge`. The review's first question: does the paid judge beat simple rules? If not, don't scale up.
- **Escalation is bounded.** Opus can choose hold, flatten or resume, with a pause of 15–240 min. Escalations are rate-limited to one per symbol per 30 min, and any API error, refusal or unparseable reply means HOLD.

## Overnight review loop
1. `tradeagent review --schema <active> --run state/<sym>` (cron after the NSE close and at 00:05 UTC for crypto)
   → `state/<sym>/reviews/<date>/report.{json,md}`, `calibration.json` (if ≥30 trades), `schemas/candidates/<id>.v<N+1>.json`
2. With `TRADEAGENT_REVIEW_WITH_OPUS=1`, Opus rewrites only the question, thesis and invalidation text. Kinds and options are fixed by `REQUIRED_FIELDS` and re-validated on load.
3. `tradeagent evaluate --incumbent … --candidate … --run …` re-scores the same journalled snapshots with both schemas (needs the live judge).
4. `tradeagent promote --candidate … --eval …/eval.json` refuses unless n ≥ 200 for both and candidate Brier ≤ incumbent. `--live` also needs `--approve`. Every promotion is appended to `schemas/PROMOTIONS.log`.
5. The calibration table goes to paper automatically (it can only shrink sizes); live use is an operator decision.
