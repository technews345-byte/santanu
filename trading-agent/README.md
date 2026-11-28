# tradeagent

A paper-first trading agent for **crypto (24/7)** and **NSE equities (intraday)**. Claude Opus 5.5 is the slow brain: research, schemas, code, escalations and nightly review. A fast typed judge is the reflex: Jev from TypeSafe AI, or a rule baseline until you have a key. Code owns every number.

> **Status: paper trading only.** There is no live broker adapter on purpose; that's gate G5 in [`docs/02-plan.md`](docs/02-plan.md). Nothing here is investment advice. Synthetic-data P&L says nothing about edge.

| Doc | What it holds |
|---|---|
| [`docs/00-spec.md`](docs/00-spec.md) | requirements and roles |
| [`docs/01-architecture.md`](docs/01-architecture.md) | data flow, design decisions, overnight review loop |
| [`docs/02-plan.md`](docs/02-plan.md) | six phases, deliverable paths, operator gates, commands |
| [`docs/03-research-crypto-2026-11-28.md`](docs/03-research-crypto-2026-11-28.md) | crypto regime and 6 finalists, with sources |
| [`docs/04-research-india-2026-11-28.md`](docs/04-research-india-2026-11-28.md) | Indian market regime, 5 finalists, SEBI and Zerodha rules, with sources |
| `schemas/*.v1.json` | the 11 compiled judge schemas |

## Quick start
```bash
cd trading-agent
python -m pytest -q                       # 44 tests
PYTHONPATH=src python -m tradeagent.cli paper  --schema schemas/btc-capitulation.v1.json --start 2026-11-28T00:00:00+00:00 --minutes 2880 --run state/btc
PYTHONPATH=src python -m tradeagent.cli review --schema schemas/btc-capitulation.v1.json --run state/btc
cat state/btc/reviews/*/report.md
```
Emergency stop: `touch state/<run>/KILL`. Entries stop at once and the position is flattened on the next candle. Clearing it takes `tradeagent reset-kill --run state/<run> --i-understand`.

## Hard rules in code (the model cannot change them)
- Gate: setup_quality ≥ 2 **and** P(direction) > 0.80 **and** risk_state = safe (also: not toxic flow, not neutral, no shorts unless enabled).
- Size: ¼-Kelly maximum on the calibrated probability after costs; ≤1% of equity at risk per trade; ≤20% of equity per position; ≤50% gross.
- Kill switch: trips and latches at 15% drawdown; 3% daily loss blocks new risk; stale data, wide spread, order-rate limits.
- Escalate to Opus when P(direction) < 0.60 or regime = crisis. Opus can only hold, flatten or resume.
- NSE: entries 09:30–14:45 IST, flat by 15:15, holidays (unknown year = closed), Zerodha charges, whole shares, circuit-band buffer, ≤1 order per second.

## WHAT COULD I BE WRONG ABOUT?
1. **There may be no edge at all.** Nothing here shows the judge predicts 60-minute direction better than chance. The baseline judge scores *worse* than a uniform guess on synthetic data, and the review says so. Until replay on recorded data shows judge Brier < baseline < uniform, assume zero edge and expect fees to make it negative.
2. **The data is secondary and some of it conflicts.** Nearly every metric came from news or aggregator sites, not primary sources. Sources disagree on Aave's buyback status, Brent ($88 vs $97 within two days), FPI totals, BTC dominance and SOL's price. Anything I couldn't verify is labelled; treat all of it as a lead to check, not a fact.
3. **Jev and AgenKit are unverified.** `typesafe.ai` and `agenkit.xyz` didn't resolve from the build environment. Jev's API shape in `judge.py` comes from secondary write-ups, and the "~81 ms" figure is the brief's claim; secondary sources say 70–500 ms. AgenKit's real phases may not match this plan. If the Jev contract differs, every Jev call fails validation and the loop holds. That's safe, but it doesn't trade.
4. **Direction confidence isn't win probability.** Kelly sizing needs P(target before stop). Until ≥30 real trades build a calibration table, sizes rest on a 5% haircut that I picked, not one I measured.
5. **The catalysts may already be priced in.** LINK's ETF filing rallied first. HYPE buybacks are well known and price fell anyway. Indian earnings beat after a ~21% rally from the October lows.
6. **Costs and slippage are assumptions.** Crypto: 5 bps fee + 3 bps slippage. NSE: the Zerodha schedule as of this build + 3 bps. Thin altcoin books (HYPE, ENA, AAVE) and opening-range breakouts in Indian stocks often slip far more. The review measures realised slippage; trust that over the assumption.
7. **The regime calls could flip fast.** Crypto sits next to `crisis`. India's tape swings on oil headlines. Intraday-only NSE and default-flat crypto limit the damage; they don't remove it.
8. **Paper fills are generous.** Touch + fixed slippage, no queue position, no partial fills, no latency, no exchange outages; the stop is assumed to fill at the touch even through a gap. Live results will be worse.
9. **Regulation and tax.** India's SEBI retail-algo rules (static IP, API keys, 2FA, generic algo ID under 10 orders/sec) need confirming with your broker. If you trade crypto from India: gains are taxed at a flat 30%, 1% TDS applies to transfers, and losses can't be set off. That alone can make a marginal crypto strategy lose after tax. Intraday equity profits are taxed as speculative business income. Check with a tax adviser.
10. **The process can fail.** A buggy promotion, a broken calibration table or a misread holiday list. Tests cover the limits, sessions, causality and gating, but not a real broker's failure modes. That's why G5 and G6 exist, and why live starts at ≤5% of intended capital.

**Survive first.** The default answer is flat. The code is built to keep losses small when it's wrong.
