# Crypto market research — 28 November 2026

**How to read this.** Every number below comes from a source listed beside it, with that source's date.
Most are secondary sources (news sites, data aggregators), not the protocols' own dashboards or filings. I could not open primary pages from the build environment, so **check each number against its primary source before acting on it.** Labels: **[confirmed]** = a reported, dated fact; **[estimate]** = someone's model or projection; **[speculation]** = a possibility nobody has confirmed. Where sources disagree, both figures are shown. Nothing here is investment advice.

---

## 1. Regime: bear market, extreme fear, contracting liquidity

| Signal | Reading | Source (date) |
|---|---|---|
| BTC price | ~$61.5k on 27 Nov; low of ~$55.7k on 21 Nov (CoinGecko hourly) | [FinFly](https://finfly.news/en/crypto/crypto-prices-2026-11-27), [Company Chronicle](https://thecompanychronicle.com/story/crypto-prices-today-november-27-2026) (27 Nov) |
| ETH price | ~$1,720–1,740 on 27 Nov | same |
| Sentiment | Fear & Greed 11–12 ("extreme fear") | [KuCoin daily report](https://www.kucoin.com/news/articles/crypto-daily-market-report-november-20-2026) (20 Nov) |
| Spot BTC ETF flows | Record ~$5.39B net **outflow** for November (one source); ~$2.9B by 20 Nov (another) | [Finwire](https://finwire.io/news/crypto-news/bitcoin-etf-outflows-us-session-roundup-nov-26-2026) (26 Nov), KuCoin (20 Nov) |
| Stablecoin supply | ~$282–283B, down from a ~$312.9B May peak; November was the steepest monthly drop since mid-2022 | [Forbes](https://www.forbes.com/sites/murtuza-merchant/2026/11/26/stablecoins-lose-20-billion-as-traders-cash-out-payments-hold-up/) (26 Nov) |
| BTC dominance | ~58–59.3%, slipping as money moves to stablecoins, **not** to altcoins | [KuCoin](https://www.kucoin.com/news/flash/bitcoin-dominance-falls-below-60-as-funds-shift-to-stablecoins-not-altcoins), [tv-hub](https://www.tv-hub.org/guide/bitcoin-dominance) (Nov) |
| Funding | Turned negative 14 Nov (first time in 5 months); roughly neutral by 27 Nov | [Library brief](https://thelibraryestate.com/cryptocurrency-markets-global-crypto-morning-brief-bitcoin-rises-toward-61600-with-stocks-as-7-billion-of-options-expire-nov-27-2026/) (27 Nov) |
| Open interest | Down ~23% over 30 days to ~20 Nov (one dataset); measured differently elsewhere, so the levels can't be compared | same |
| On-chain | Below the short-term-holder realised price (~$75.4k) since mid-Nov; realised losses at levels seen at the 2018/2020/2022 bottoms (Glassnode, via Coinotag); 30-day net realised loss −$8.4B (CryptoQuant) | [Axel Adler Jr.](https://axeladlerjr.com/bitcoin-drops-10-below-sth-realized-price.md) (13 Nov), [Coinotag](https://en.coinotag.com/bitcoin-btc-capitulation-realized-losses-bottom-levels), [CryptoQuant](https://cryptoquant.com/quicktake/6afe7af31dd13d48fe975d2f-Bitcoin-Holders-Are-Locking-In-Losses-Fast-But-Capitulation-Isnt-Complete-Yet) |
| Macro | Fed held in October with a hawkish tone; no December decision yet | [Cointelegraph](https://cointelegraph.com/news/bitcoin-faces-fresh-pressure-after-feds-hawkish-rate-hold-analysts) (29 Oct) |
| Bottom forecasts | **[estimate]** $40–50k (one analyst); Galaxy base case $40–46k | [Galaxy](https://www.galaxy.com/insights/research/bitcoin-four-year-cycle-where-is-the-bottom) |

**Regime call: `high_vol`, sitting next to `crisis`.** Every liquidity gauge is shrinking (ETF flows, stablecoin supply, open interest) and sentiment is at capitulation levels. Capitulation readings have marked past bottoms, but they don't time them: in 2022 the market stayed at "bottom-like" readings for months.

**What follows for the system:** default to flat. Spot shorting is off by default. Escalation to Opus fires whenever the judge says `crisis`. The setups below are a **watchlist with conditional triggers**, not buys.

---

## 2. Finalists

For each one: thesis, catalyst (confirmed vs speculative), supply, revenue and whether value reaches the token, the bear case, what invalidates it, and its compiled schema file. **Holder concentration was not verified for any of them**; check the top-holder share on a block explorer before sizing.

### 2.1 BTC: capitulation reversal (long only after confirmation) — `schemas/btc-capitulation.v1.json`
- **Thesis:** realised-loss and holder-cost-basis readings are at levels seen at past cycle lows, and funding has reset. The aim is to catch the reversal *after* it confirms, not to guess the low.
- **Catalysts:** [confirmed] realised-loss extremes and funding reset (sources above). [speculation] the ETF outflow streak ends, or the Fed turns dovish.
- **Supply / value accrual:** fixed issuance; no unlock overhang. Value accrual isn't the question for BTC; flows are.
- **Bear case (strong):** ETF holders are still selling, stablecoin supply is shrinking, and the macro tone is hawkish. Analysts' base cases sit $15–20k lower ([estimate], Galaxy). Capitulation readings can persist for months.
- **Invalidation:** a new low below ~$55.7k (the 21 Nov low), or 4-hour returns staying negative while volatility rises.

### 2.2 HYPE (Hyperliquid): revenue-funded buybacks — `schemas/hype-buyback.v1.json`
- **Thesis:** one of the few tokens with large, real, recurring cash flow going to holders: ~$68–78M per 30 days of protocol revenue routed to buybacks ([DefiLlama](https://defillama.com/protocol/hyperliquid) via secondary reports, Nov 2026); cumulative burns ~50.8M HYPE (~5% of max supply, reported 12 Nov, [Coinpedia](https://coinpedia.org/price-analysis/hyperliquid-burns-50-7m-hype-can-buybacks-stop-the-tokens-downtrend/)).
- **Catalysts:** [confirmed] buybacks are running. [speculation] perp volumes recover with volatility.
- **Value accrual:** yes, directly, through the Assistance Fund's buybacks.
- **Bear case:** the price kept falling *despite* buybacks (broke below $60, ~$58.55 on 25 Nov, [CoinCentral](https://coincentral.com/hyperliquid-hype-price-breaks-below-60-despite-78-million-in-token-buybacks)). Revenue tracks volume and is cyclical. Team-token unlocks continue ([KuCoin](https://www.kucoin.com/news/flash/over-200m-in-hype-sui-eigen-tokens-to-unlock-this-week); dates not verified). Competing perp DEXs and regulatory risk remain.
- **Invalidation:** 30-day revenue falls sharply, buybacks pause, or price loses late-November support on sell-side flow.

### 2.3 LINK: ETF filing plus reserve accumulation — `schemas/link-etf.v1.json`
- **Thesis:** Fidelity filed an S-1 for a spot LINK ETF on 25 Nov 2026 ([The Block](https://www.theblock.co/newsletters/the-daily/2026-11-26-fidelity-chainlink-etf-musk-x-ruling-alleged-bitcoin-content-farm-case-more-crypto-news-446755), 26 Nov). The Chainlink Reserve, funded from usage fees, holds ~6.93M LINK (~$64M) ([KuCoin](https://www.kucoin.com/news/flash/chainlink-reserve-adds-122-450-link-total-holdings-reach-64-22m), 26 Nov).
- **Catalysts:** [confirmed] the filing exists. [speculation] approval, launch date, fees.
- **Value accrual:** partial. The reserve buys LINK from fees, but its purchases (~$1M a week) are small next to daily volume.
- **Bear case:** existing LINK ETFs are small (Grayscale GLNK ~$112M, Bitwise CLNK ~$42M) and saw ~$1.5M net outflows in November ([CoinMarketCap](https://coinmarketcap.com/academy/article/crypto-news-today-nov-27-2026)). A filing is not an approval, and the ~8% weekly rally may already price in the news.
- **Invalidation:** the filing is withdrawn or delayed, outflows persist, or the late-November rally fully retraces.

### 2.4 SOL: flows and app revenue up while price lagged — `schemas/sol-flows.v1.json`
- **Thesis:** SOL ETPs took in $492.3M of net inflows in Q3 2026 ([Blockworks Q3 report](https://blockworks.com/api/investor-report/solana-token-holder-report-q3-2026/pdf)). App revenue was $299.1M in Q3, up 48% QoQ. Stakers earned $495M in Q3 ([Messari Q3](https://messari.io/report/solana-token-holder-report-q3-2026)).
- **Catalysts:** [confirmed] Q3 figures. [speculation] Q4 flows recover.
- **Value accrual:** through staking yield and fee burn. App revenue mostly goes to the apps, not to SOL.
- **Bear case:** spot SOL ETF flows were flat to negative in late Oct/early Nov ([Decrypt tracker](https://decrypt.co/solana)). Q3 numbers predate the November drawdown. The current price is unconfirmed (sources span ~$63–90, with dates unclear).
- **Invalidation:** ETF flows stay negative for weeks, or SOL makes new cycle lows with rising volatility.

### 2.5 AAVE: buyback restart, an event setup — `schemas/aave-buyback-restart.v1.json`
- **Thesis:** if governance restarts buybacks (the "Aavenomics 3.0" plan), value accrual comes back.
- **Catalysts:** **sources conflict.** One says buybacks went live 27 Jun 2026; others (6 and 27 Nov) say they have been paused since 19 Apr, pending a vote ([Coin Republic](https://www.thecoinrepublic.com/2026/11/06/can-aave-price-rally-to-140-amid-latest-bets-from-kraken-parent-payward/); [DefiLlama adapter issue](https://github.com/DefiLlama/dimension-adapters/issues/10321)). Revenue figures conflict too (~$44.6M over 180 days in one report vs ~$400M annualised in another). → **[speculation] until a governance vote shows on-chain.**
- **Bear case:** revenue is falling with borrow demand, and the status is unclear.
- **Invalidation:** the vote fails or is delayed, or revenue keeps declining.

### 2.6 ENA: watch-only; the asymmetry points down — `schemas/ena-fee-switch-watch.v1.json`
- **Facts:** the fee switch was approved but stays inactive until USDe's 14-day average supply tops $7.5B. USDe supply was ~$4.07B in late summer ([The Block](https://www.theblock.co/news/ecosystems/2026-08-27-ethena-foundation-proposes-fee-switch-ena-token-buybacks-other-updates-412951), 27 Aug; [Tokenomist](https://tokenomist.ai/research/weekly-unlock-digest-aug-31-sep-6-2026-ethenas-fee-switch-2)). Remaining investor tokens unlocked at once from 5 Oct. Current USDe supply was not found.
- **Why it's on the list:** it's the textbook "catalyst depends on a threshold the market is moving away from" case, since stablecoin supply is shrinking. The system is spot long-only, so it should keep returning `neutral`. It's kept as a control: if the judge often says "long ENA", that's a calibration red flag.

**Considered and dropped:** SUI. Its 1 Dec unlock is small (~7.2M SUI, ~$4.5M) per [DefiLlama](https://defillama.com/unlocks/sui-foundation), but price is ~$0.62, down hard, and sources conflict on whether vesting has finished. There's no clean thesis.

---

## 3. Final check (crypto)

| Question | Answer |
|---|---|
| Organic or incentive-driven edge? | HYPE and LINK have fee-funded buybacks (organic). AAVE's depends on a vote. SOL's app revenue mostly doesn't reach the token. ENA's depends on a threshold it is moving away from. |
| Already priced in? | LINK's filing rally may be. HYPE buybacks are well known and price still fell, so the market is discounting them. |
| Does value accrue to the token? | Yes for HYPE (direct) and BTC (n/a, monetary). Partly for LINK and SOL. Not now for AAVE and ENA. |
| Survives costs and slippage? | Unknown until paper-tested on recorded order books. The policy refuses trades whose expected edge is below 2× round-trip cost (~16 bps assumed). |
| Any hard limit delegated to the model? | No. `RiskEngine.check()` takes no model output (a test asserts this). Thresholds are frozen dataclasses. Calibration can only lower probabilities. |
