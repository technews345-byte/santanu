# Spec (phase 1)

## Goal
A 24/7 crypto (and NSE intraday) trading agent that watches markets, scores pre-researched setups on every candle with a fast typed judge, trades them inside hard limits, and reviews itself every night. The operator approves the gates in `02-plan.md`; nothing goes live without them.

## Roles
| Layer | Who | Does | Never does |
|---|---|---|---|
| Brain | Claude Opus 5.5 (via Claude Code for research and builds, via the API for escalations and reviews) | research, schema wording, code, nightly review, deep re-reads on escalation | place orders, change limits |
| Reflex | Jev (TypeSafe AI), or `BaselineJudge` until a key exists | one call per candle: 5 typed fields, each with probabilities | size, thresholds, side effects |
| Code | this repo | every number: features, gates, sizes, stops, limits, kill switch, sessions, charges | defer a limit to a model |

## Functional requirements
1. **State engine:** order book and trades → one snapshot under 400 tokens per candle, built only from data timestamped at or before the candle close. Mid, spread, imbalance, realised vol, inventory and drawdown are computed in code.
2. **Judge schema:** `regime` ∈ {trending, mean_reverting, high_vol, crisis}, `direction` ∈ {long, short, neutral}, `toxic_flow` bool, `setup_quality` 0–3, `risk_state` ∈ {safe, near_limit, reduce}. All five come back in one call, each with probabilities.
3. **Gate:** fire only if setup_quality ≥ 2, P(direction) > 0.80, risk_state = safe (also: not toxic, not neutral, shorting allowed).
4. **Sizing:** fractional Kelly on the calibrated probability, net of costs, capped at ¼ Kelly and at 1% of equity at risk per trade.
5. **Risk:** max drawdown 15% (latching kill switch), daily loss 3%, position 20% of equity, gross 50%, stale-data, spread, order-rate and market-session checks before **every** order.
6. **Escalation:** P(direction) < 0.60 or regime = crisis → no new entries, escalate to Opus, which can only answer hold, flatten or resume.
7. **Nightly review:** Brier score vs a baseline and vs a uniform guess, reliability buckets, missed trades by gate, slippage, a proposed calibration table, and a candidate schema. Promotion is gated.
8. **Markets:** crypto spot (24/7) and NSE cash intraday (session, holidays, flat-by 15:15 IST, Zerodha charges, whole shares, circuit bands, SEBI order-rate ceiling).

## Non-goals (for now)
Leverage, perps shorting, options, overnight NSE positions, market making, and live broker integration (gate G5).

## Acceptance
`pytest` green; paper replay runs end to end on both markets; the review produces a report and a valid candidate schema; no code path lets model output change a limit.
