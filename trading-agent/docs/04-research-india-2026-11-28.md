# Indian stock market research — 28 November 2026

**How to read this.** Same rules as the crypto note: each number cites a source and its date, most sources are secondary (news and aggregator sites), and every figure needs checking against NSE, NSDL, RBI or company filings before use. **[confirmed]** = reported, dated fact; **[estimate]** = forecast or model; **[speculation]** = unconfirmed possibility. Not investment advice.

**Scope.** The same machinery as crypto (state engine, typed judge, gates, quarter-Kelly, hard risk layer, nightly review), running on **NSE cash equities, intraday (MIS), long-only by default**. India-specific rules are code in `src/tradeagent/markets.py` (`NSE_EQUITY_INTRADAY`):

| Rule | Value | Why |
|---|---|---|
| Session | 09:15–15:30 IST, Mon–Fri, minus NSE holidays | NSE timings |
| Entry window | 09:30–14:45 IST | skip the opening auction noise and the last hour |
| Flat-by | 15:15 IST | be out before Zerodha's MIS auto square-off (~15:20–15:25, ₹50 + GST charge) |
| Holidays | 2026 NSE equity list; **an unknown year counts as closed** | so it never trades on a holiday because the list wasn't updated |
| Charges | Zerodha intraday: brokerage 0.03% or ₹20/order (lower), STT 0.025% sell, NSE txn 0.00297%, SEBI ₹10/crore, stamp 0.003% buy, GST 18% | the same schedule the day-trader-india plugin uses; **verify with Zerodha's calculator** |
| Quantity | whole shares | cash segment |
| Circuit bands | no entry within 1% of the day's band | avoid getting stuck at a frozen price |
| Order rate | ≤ 1 order/second, ≤ 12/hour | SEBI's retail-algo threshold is 10 orders/sec for the generic algo ID; stay an order of magnitude under it |

**Compliance (SEBI retail-algo framework, mandatory since 1 Apr 2026).** API orders need client-specific API keys, a **static IP registered with your broker**, and daily 2FA. Below 10 orders/sec a personal API user can trade under the exchange's **generic algo ID** without registering each strategy. Sources: [Zerodha Z-Connect](https://zerodha.com/z-connect/?p=404632), [NSE retail-algo FAQ (3 Nov 2025)](https://nsearchives.nseindia.com/web/sites/default/files/inline-files/FAQ_Retail_Algo_03112025_NSE.pdf), [SEBI circular PDF](https://www.sebi.gov.in/sebi_data/attachdocs/sep-2025/1759232056254.pdf). Some blogs claim every API strategy must be registered, or that black-box algos need an RA licence; those claims are weaker. **Confirm with your broker before going live (gate G5).** A cloud server's IP changes unless you reserve one, so the live deployment needs a fixed-IP host.

---

## 1. Regime: earnings strong, macro tightening, oil shock

| Signal | Reading | Source (date) |
|---|---|---|
| Nifty 50 | 25,607.20 (−1.07%) on 27 Nov; Sensex 83,339.26 (−1.17%); second straight down day | [Business Standard](https://www.business-standard.com/amp/markets/news/stock-market-live-november-27-nse-bse-sensex-today-nifty50-gift-nifty-crude-oil-prices-mahanadi-coalfields-share-price-ipo-today-126112700100_1.html), [Marketcalls](https://www.marketcalls.in/futures-and-options/post-market-report-27-november-2026.html) (27 Nov) |
| Why it fell | Brent above $97 after attacks in West Asia; India–US trade deal uncertainty. IT, private banks, autos and financials led losses; **metals and chemicals rose** | same |
| Brent (conflict) | ~$88 on 25 Nov after falling ~23% in November ([TradingView/Moneycontrol](https://www.tradingview.com/news/moneycontrol:db30de54a094b:0-indigo-bpcl-asian-paints-other-crude-sensitive-shares-rise-up-to-4-as-brent-eases-to-88/)), then >$97 on 27 Nov (Business Standard). **Very volatile; check live.** | 25–27 Nov |
| India VIX | ~16.55–16.60 on 27 Nov | [HDFC Sky](https://hdfcsky.com/news/india-vix-falls-1-48percent-to-16-60-despite-sharp-equity-market-losses-and-rising-crude) (27 Nov) |
| RBI | **Hiked** repo 25 bp to 5.50% in October; stance "calibrated tightening"; FY27 CPI forecast 5.2%, GDP 7.1% | [Business Standard](https://www.business-standard.com/finance/news/rbi-mpc-raises-fy27-inflation-forecast-to-5-2-projects-gdp-growth-at-7-1-126100700283_1.html) (7 Oct) |
| FPI flows | Record net **buying** in November: ~₹1.01–1.12 lakh crore by ~20 Nov (NSDL vs exchange data differ), reversing Sep–Oct outflows; 2026 YTD still a net outflow (~₹1.8–2.1 lakh crore) | [Ventura](https://www.venturasecurities.com/news/stocks/fiis-pour-record-funds-into-india-where-is-the-money-going/), [Univest](https://univest.in/blogs/fii-buying-november-2026-dii-selling) (Nov) |
| DII flows | Mixed; net sellers on several days, e.g. ~₹556 crore on 27 Nov | [craytheon](https://craytheon.com/charts/fii-dii-data/) |
| Earnings (Q2 FY27) | Nifty-50 PAT +27% YoY (17-quarter high); Nifty-500 PAT +32%; metals +76%; oil & gas beat estimates most (Nomura); only EMS posted negative growth | [Business Today](https://www.businesstoday.in/markets/stocks/story/nifty-500-companies-log-strongest-earnings-growth-in-12-quarters-pat-jumps-32-in-q2-mofsl-569206-2026-11-24) (24 Nov), [Zee Business](https://www.zeebiz.com/market-news/news-q2-earnings-beat-estimates-nifty-pat-growth-hits-17-quarter-high-119-companies-see-upgrades-says-motilal-oswal-405616) |
| Valuation | Nifty 100 PE 20.35 vs 5-yr median 22.13 (20 Nov); Nifty Commodities PE 14.52 vs 15.36 (8 Nov) | [indexpe](https://indexpe.in/nifty-100) |
| Trade | India–US interim deal stalled as of early Oct; no November update found | [TimesLIVE explainer](https://www.timeslive.co.za/news/world/2026-10-07-explainer-why-india-us-trade-talks-have-stalled-again/) (7 Oct) |
| Outlook | **[estimate]** MOFSL sees H2 FY27 Nifty earnings growth of 18% | Zee Business |

**Regime call: `mean_reverting` with `high_vol` spells driven by oil headlines.** It isn't `crisis`: VIX is mid-teens, earnings are strong, and foreign money is coming in. Headwinds are an RBI in tightening mode, an oil shock, and a stalled trade deal. That favours intraday mean reversion and breakouts on confirmed sector strength over overnight directional bets, which suits an intraday-only, flat-by-15:15 design.

---

## 2. Finalists (NSE, intraday long-only)

Shareholding concentration (promoter or government stake, pledges) **was not verified for any of them**; check the latest shareholding pattern on NSE before trading.

### 2.1 Nifty 50 via NIFTYBEES: earnings vs valuation — `schemas/nifty-earnings.v1.json`
- **Thesis:** earnings are growing at multi-year highs while the index PE sits below its 5-year median, and FPIs are buying. Buy intraday pullbacks that hold the opening range.
- **Catalysts:** [confirmed] Q2 earnings and November FPI flows. [estimate] H2 earnings growth. [speculation] a trade deal.
- **Bear case:** the RBI is hiking, not cutting. A sustained Brent spike hurts India's import bill and the rupee. Analysts call the FPI buying "tactical", not a confirmed reversal. One report says Indian stocks trade at a ~14% premium to the S&P 500 after the rally ([NiftyTrader](https://www.niftytrader.in/markets/indian-stocks-rally-21-from-october/)).
- **Invalidation:** Brent holds above ~$95, the RBI signals more hikes, or FPI flows flip to sustained selling.
- **Note:** NIFTYBEES is an ETF. Check its intraday liquidity and spread; the risk layer rejects entries above 15 bps spread.

### 2.2 ONGC: upstream oil, valuation vs crude — `schemas/ongc-crude.v1.json`
- **Thesis:** a brokerage note says ONGC's valuation implies ~$62 Brent against its $75 FY28 assumption, at ~5.6× one-year-forward PE **[estimate]**. ONGC traded near its 52-week low on 10 Nov ([Business Today](https://www.businesstoday.in/markets/stocks/story/itc-power-grid-ongc-coal-india-sbi-life-nifty-stocks-trade-near-52-week-lows-whats-next-566633-2026-11-10)).
- **Catalysts:** [confirmed] Brent spiked late in November. [speculation] it stays there.
- **Value accrual:** through earnings and dividends to shareholders. The government is the majority holder, so policy can redirect windfalls.
- **Bear case:** Brent fell ~23% in November before the spike, so it swings both ways fast. Windfall taxes or subsidy-sharing can cap the upside, and government ownership adds policy risk.
- **Invalidation:** Brent falls back toward ~$85, or windfall-tax or subsidy-sharing news appears.

### 2.3 BPCL: oil marketer, the inverse of crude — `schemas/bpcl-crude-reversal.v1.json`
- **Thesis:** cheap on reported multiples (BPCL PE ~8.4, IOC ~4.2, HPCL dividend yield ~6.2%, all as of 25 Nov per [Univest](https://univest.in/blogs/crude-sensitive-stocks-rise-brent-eases-indigo-bpcl-asian-paints)). These stocks jump when crude eases (up to 4% on 25 Nov).
- **Rule:** long only on days crude is *falling*. It pairs naturally with ONGC: the judge should rarely say long on both at once, and the review checks that.
- **Bear case:** with Brent above $97, marketing margins get squeezed. Government pricing controls (retail fuel price freezes) cause under-recoveries.
- **Invalidation:** Brent rising, or price-freeze or under-recovery headlines.

### 2.4 Tata Steel: metals momentum — `schemas/metals-momentum.v1.json`
- **Thesis:** metals were the largest Q2 FY27 profit contributor (sector PAT +76%, MOFSL via Business Today, 24 Nov) and among the few gainers on 27 Nov. Trade opening-range breakouts with buy-side flow.
- **Bear case:** profits growing this fast are often near a cyclical peak. Metals depend on China steel prices and on safeguard duties.
- **Invalidation:** a China steel-price slump, a safeguard-duty rollback, or the sector losing relative strength against Nifty.

### 2.5 Infosys: contrarian IT — `schemas/infy-contrarian.v1.json`
- **Thesis:** IT is out of favour. Infosys cut its FY27 guidance to 1.5–3% around July 2026, though large-deal wins rose 12.5% QoQ to $3.6B ([IndMoney](https://www.indmoney.com/blog/stocks/why-indian-it-companies-are-benefitting-from-ai-despite-disruption-fears)). The rupee at record lows (≥93–96/USD at points in 2026) supports margins. Buy only after sharp intraday sell-offs that stall.
- **Bear case:** fears of AI cannibalising services revenue, slow client decisions, and US trade or tariff risk on services. IT led the 27 Nov sell-off. **No November 2026 data found; this thesis rests on mid-2026 data.**
- **Invalidation:** another guidance cut, a US services-tariff escalation, or continued sector-wide selling.

**Watchlist, not compiled:** ITC, Coal India and Power Grid were near 52-week lows on 10 Nov (Business Today). That's a dividend-yield value case, but it's slow and not intraday-friendly; better as a separate swing or positional strategy outside this loop.

---

## 3. Final check (India)

| Question | Answer |
|---|---|
| Organic or incentive-driven edge? | The earnings growth is organic. FPI flows are tactical and can reverse. The oil trades are pure macro beta. |
| Already priced in? | Nifty rallied ~21% from its October lows (per NiftyTrader), so a lot of the earnings beat is in the price. Trading intraday sidesteps the overnight question, but the intraday edge is unproven. |
| Value to the shareholder? | Yes, through earnings and dividends. Government-owned names carry policy risk. |
| Survives costs? | Zerodha round-trip on ₹1 lakh is ~₹82 (~8 bps) before slippage; the policy adds assumed slippage and requires a 2× cost hurdle. **STT is on the sell side only, so small, frequent trades get expensive.** |
| Hard limits delegated to the model? | No. Session, flat-by, holidays, circuit bands, whole shares, order rate and every risk limit are code, and tests enforce them. |
