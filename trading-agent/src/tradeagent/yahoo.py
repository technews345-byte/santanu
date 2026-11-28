"""Real price data from Yahoo Finance's public chart endpoint, converted into replay events.

What is real and what is not:
  * REAL: 1-minute open/high/low/close/volume bars, as Yahoo serves them (may lag and has gaps).
  * APPROXIMATED: Yahoo has no order book. Each bar becomes 60 one-second books whose mid walks
    open -> low -> high -> close (open -> high -> low -> close for a down bar), with a spread of
    max(1 tick, 0.5 bps) and equal depth on both sides. Bar volume is split evenly across those
    seconds, and each trade's aggressor is the direction of its one-second step. Snapshot fields
    built from depth (imbalance, microprice) are therefore uninformative, and flow is a proxy.

Use it for replay and the nightly review, not for live trading decisions.
Network: needs query1.finance.yahoo.com reachable. Response bodies are untrusted and validated.
"""
from __future__ import annotations

import json
import math
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Iterator

_ANCHORS = (0, 20, 40, 59)              # seconds at which a bar's path hits open, low/high, high/low, close
CHART_URL ="https://query1.finance.yahoo.com/v8/finance/chart/{sym}"
VALID_RANGES = ("1d", "5d", "7d")          # Yahoo only serves 1-minute bars for about the last week


class YahooDataError(RuntimeError):
    pass


def yahoo_symbol(schema_symbol: str, market: str) -> str:
    """NSE symbols get '.NS'; crypto pairs quoted in USDT map to Yahoo's '-USD' tickers."""
    s = schema_symbol.upper()
    if market.startswith("nse"):
        return s if s.endswith(".NS") else s + ".NS"
    for quote in ("USDT", "USDC", "USD"):
        if s.endswith(quote) and len(s) > len(quote):
            return s[: -len(quote)] + "-USD"
    return s


def fetch_chart(ysym: str, rng: str = "5d", timeout_s: float = 30.0) -> dict:
    if rng not in VALID_RANGES:
        raise ValueError(f"range must be one of {VALID_RANGES}")
    q = urllib.parse.urlencode({"interval": "1m", "range": rng, "includePrePost": "false"})
    url = CHART_URL.format(sym=urllib.parse.quote(ysym, safe="")) + "?" + q
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (tradeagent replay)"})
    with urllib.request.urlopen(req, timeout=timeout_s) as r:
        return json.loads(r.read())


def parse_bars(body: dict) -> tuple[dict, list[tuple[int, float, float, float, float, float]]]:
    """-> (meta, [(ts_s, open, high, low, close, volume)]) with bad or missing bars dropped."""
    chart = body.get("chart") if isinstance(body, dict) else None
    if not isinstance(chart, dict):
        raise YahooDataError("no 'chart' in response")
    if chart.get("error"):
        raise YahooDataError(f"Yahoo error: {chart['error']}")
    res = chart.get("result")
    if not res or not isinstance(res, list):
        raise YahooDataError("empty result")
    r0 = res[0]
    ts = r0.get("timestamp") or []
    try:
        q = r0["indicators"]["quote"][0]
    except (KeyError, IndexError, TypeError) as e:
        raise YahooDataError("missing quote block") from e
    cols = [q.get(k) or [] for k in ("open", "high", "low", "close", "volume")]
    bars, last_t = [], -1
    for i, t in enumerate(ts):
        try:
            o, h, l, c, v = (col[i] for col in cols)
        except IndexError:
            continue
        if None in (o, h, l, c) or not isinstance(t, int) or t <= last_t:
            continue
        o, h, l, c, v = float(o), float(h), float(l), float(c), float(v or 0)
        if not all(math.isfinite(x) and x > 0 for x in (o, h, l, c)) or v < 0 or not math.isfinite(v):
            continue
        h, l = max(h, o, c), min(l, o, c)          # repair bars whose high/low exclude open/close
        bars.append((t, o, h, l, c, v))
        last_t = t
    if not bars:
        raise YahooDataError("no usable bars")
    return r0.get("meta", {}), bars


def bars_to_events(symbol: str, bars, tick: float = 0.01, spread_bps: float = 0.5,
                   levels: int = 10, depth: float = 100.0) -> Iterator[dict]:
    """Replay events in the format `tradeagent replay` reads, one book (and trade) per second."""
    for t, o, h, l, c, v in bars:
        path = (o, l, h, c) if c >= o else (o, h, l, c)
        prev = o
        for s in range(60):
            # anchors land exactly on seconds 0, 20, 40, 59 so the bar's real high and low are
            # both visited (otherwise a stop near the low could be skipped: optimistic fills)
            k = 0 if s < 20 else 1 if s < 40 else 2
            a, b = _ANCHORS[k], _ANCHORS[k + 1]
            px = path[k] + (path[k + 1] - path[k]) * (s - a) / (b - a)
            ts_ms = t * 1000 + s * 1000
            spread = max(tick, px * spread_bps / 1e4)
            step = max(tick, px * 1e-4)
            yield {"type": "book", "symbol": symbol, "ts_ms": ts_ms,
                   "bids": [[round(px - spread / 2 - j * step, 6), depth] for j in range(levels)],
                   "asks": [[round(px + spread / 2 + j * step, 6), depth] for j in range(levels)]}
            if v > 0:
                yield {"type": "trade", "symbol": symbol, "ts_ms": ts_ms, "price": round(px, 6),
                       "size": v / 60, "aggressor": "buy" if px >= prev else "sell"}
            prev = px


def write_events(path: str | Path, events) -> int:
    n = 0
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        for e in events:
            f.write(json.dumps(e, separators=(",", ":")) + "\n")
            n += 1
    return n
