"""Nightly review: read the whole journal, score the judge, propose (never silently apply) changes.

Outputs, under state/reviews/<date>/:
  report.json / report.md   - Brier (multi-class, direction) for the judge and the shadow baseline,
                              reliability buckets, trade P&L, win-rate vs calibrated probability,
                              realised slippage vs the cost model, misses by failing gate,
                              escalations, judge errors and latency.
  calibration.json          - proposed Calibrator table from real trade outcomes. Policy only ever
                              applies it as min(haircut, table), so it can only make sizing smaller.
  candidate schema          - schemas/candidates/<id>.v<N+1>.json, rewritten by Opus if enabled.

Promotion (tradeagent promote) is a separate, gated step:
  paper  - candidate must validate and must not have a worse Brier than the incumbent on the same
           snapshots (re-scored with the live judge), with at least MIN_EVAL_SAMPLES samples.
  live   - all of the above AND --approve from the operator.
"""
from __future__ import annotations

import bisect
import json
import math
import os
import statistics
from dataclasses import dataclass
from pathlib import Path

from .jev_schema import JevSchema, load_schema, schema_to_dict
from .journal import Journal

DIRS = ("long", "short", "neutral")
MIN_EVAL_SAMPLES = 200
MIN_TRADES_FOR_CALIBRATION = 30


def direction_label(fwd_ret_bps: float, threshold_bps: float) -> str:
    if fwd_ret_bps > threshold_bps:
        return "long"
    if fwd_ret_bps < -threshold_bps:
        return "short"
    return "neutral"


def brier_multiclass(probs: dict, label: str) -> float:
    return sum((float(probs.get(k, 0.0)) - (1.0 if k == label else 0.0)) ** 2 for k in DIRS)


def brier_binary(p: float, y: int) -> float:
    return (p - y) ** 2


@dataclass
class _Series:
    ts: list[int]
    mid: list[float]

    def at_or_after(self, t: int) -> float | None:
        i = bisect.bisect_left(self.ts, t)
        return self.mid[i] if i < len(self.ts) else None


def _pct(xs: list[float], q: float) -> float | None:
    if not xs:
        return None
    xs = sorted(xs)
    return xs[min(len(xs) - 1, int(q * len(xs)))]


def review(journal_path: str | Path, horizon_min: int = 60, label_threshold_bps: float = 16.0) -> dict:
    ev = list(Journal(journal_path).read())
    snaps = [e for e in ev if e["kind"] == "snapshot"]
    series = _Series([e["ts"] for e in snaps], [e["snap"]["mid"] for e in snaps])
    mid_at = {e["ts"]: e["snap"]["mid"] for e in snaps}
    H = horizon_min * 60_000

    def score(kind: str) -> dict:
        rows = []
        for e in ev:
            if e["kind"] != kind:
                continue
            m0, m1 = mid_at.get(e["ts"]), series.at_or_after(e["ts"] + H)
            if m0 is None or m1 is None or (series.ts and series.ts[-1] < e["ts"] + H):
                continue
            lab = direction_label((m1 / m0 - 1) * 1e4, label_threshold_bps)
            d = e["decision"]["direction"]
            rows.append((d["probs"], d["value"], lab))
        if not rows:
            return {"n": 0}
        briers = [brier_multiclass(p, lab) for p, _, lab in rows]
        buckets: dict[str, list[int]] = {}
        for p, v, lab in rows:
            top = float(p[v])
            b = f"{min(0.9, math.floor(top * 10) / 10):.1f}"
            buckets.setdefault(b, []).append(int(v == lab))
        return {
            "n": len(rows),
            "brier": statistics.fmean(briers),
            "brier_uniform": brier_multiclass({k: 1 / 3 for k in DIRS}, "neutral"),
            "label_mix": {k: sum(1 for *_, l in rows if l == k) / len(rows) for k in DIRS},
            "reliability": {b: {"n": len(v), "hit_rate": sum(v) / len(v)} for b, v in sorted(buckets.items())},
        }

    # trades: pair entry fills with the next flattening fill for the symbol
    fills = [e for e in ev if e["kind"] == "fill" and e.get("fill")]
    trades, open_ = [], None
    for e in fills:
        f = e["fill"]
        if e.get("why") == "entry":
            open_ = e
        elif open_ is not None:
            ef = open_["fill"]
            sgn = 1 if ef["side"] == "buy" else -1
            pnl = sgn * (f["price"] - ef["price"]) * ef["qty"] - ef["fee"] - f["fee"]
            slip = sgn * (ef["price"] / open_["decision_mid"] - 1) * 1e4 if open_.get("decision_mid") else None
            trades.append({"entry_ts": ef["ts_ms"], "exit_ts": f["ts_ms"], "pnl": pnl,
                           "p_cal": open_.get("p_cal"), "p_raw": open_.get("p_raw"),
                           "win": int(pnl > 0), "entry_slip_bps": slip, "exit": e.get("why")})
            open_ = None

    tr_brier = [brier_binary(t["p_cal"], t["win"]) for t in trades if t["p_cal"] is not None]
    slips = [t["entry_slip_bps"] for t in trades if t["entry_slip_bps"] is not None]

    misses: dict[str, dict] = {}
    for e in ev:
        if e["kind"] != "intent" or e["intent"]["kind"] != "hold" or not e["intent"].get("failed_gates"):
            continue
        m0, m1 = mid_at.get(e["ts"]), series.at_or_after(e["ts"] + H)
        if m0 is None or m1 is None:
            continue
        r = (m1 / m0 - 1) * 1e4
        for g in e["intent"]["failed_gates"]:
            key = g.split("=")[0]
            d = misses.setdefault(key, {"n": 0, "abs_move_gt_threshold": 0})
            d["n"] += 1
            d["abs_move_gt_threshold"] += int(abs(r) > label_threshold_bps)

    lat = [e["decision"]["latency_ms"] for e in ev if e["kind"] == "decision"]
    report = {
        "events": len(ev), "snapshots": len(snaps), "horizon_min": horizon_min,
        "label_threshold_bps": label_threshold_bps,
        "judge": score("decision"), "baseline": score("shadow"),
        "trades": {"n": len(trades), "pnl": sum(t["pnl"] for t in trades),
                   "win_rate": (sum(t["win"] for t in trades) / len(trades)) if trades else None,
                   "mean_p_cal": statistics.fmean([t["p_cal"] for t in trades if t["p_cal"]]) if tr_brier else None,
                   "brier_p_cal": statistics.fmean(tr_brier) if tr_brier else None,
                   "entry_slip_bps_mean": statistics.fmean(slips) if slips else None,
                   "entry_slip_bps_p95": _pct(slips, 0.95)},
        "trade_list": trades,
        "misses": misses,
        "escalations": sum(1 for e in ev if e["kind"] == "escalation"),
        "judge_errors": sum(1 for e in ev if e["kind"] == "judge_error"),
        "halts": sum(1 for e in ev if e["kind"] == "halt"),
        "latency_ms": {"p50": _pct(lat, 0.5), "p95": _pct(lat, 0.95)},
    }
    j, b = report["judge"], report["baseline"]
    report["verdict"] = (
        "insufficient data" if j.get("n", 0) < MIN_EVAL_SAMPLES else
        "judge beats baseline" if j["brier"] < b.get("brier", 9) else
        "judge does NOT beat baseline: do not scale up")
    return report


def propose_calibration(trades: list[dict]) -> list[tuple[float, float]] | None:
    """Bucket p_raw, Laplace-smoothed win rates. None until enough trades exist."""
    ts = [t for t in trades if t.get("p_raw") is not None]
    if len(ts) < MIN_TRADES_FOR_CALIBRATION:
        return None
    edges = [0.80, 0.85, 0.90, 0.95, 1.0001]
    out = []
    for lo, hi in zip(edges, edges[1:]):
        b = [t for t in ts if lo <= t["p_raw"] < hi]
        if len(b) >= 5:
            out.append(((lo + min(hi, 1.0)) / 2, (sum(t["win"] for t in b) + 1) / (len(b) + 2)))
    return out if len(out) >= 2 else None


def to_markdown(r: dict) -> str:
    j, b, t = r["judge"], r["baseline"], r["trades"]
    lines = [
        "# Nightly review", "",
        f"**Verdict:** {r['verdict']}", "",
        f"- snapshots: {r['snapshots']}, horizon: {r['horizon_min']} min, label threshold: {r['label_threshold_bps']} bps",
        f"- judge direction Brier: {j.get('brier', 'n/a')} (n={j.get('n', 0)}); "
        f"baseline: {b.get('brier', 'n/a')} (n={b.get('n', 0)}); uniform: {j.get('brier_uniform', 'n/a')}",
        f"- trades: {t['n']}, P&L: {t['pnl']:.2f}, win rate: {t['win_rate']}, mean p_cal: {t['mean_p_cal']}, "
        f"Brier(p_cal): {t['brier_p_cal']}",
        f"- entry slippage bps mean/p95: {t['entry_slip_bps_mean']} / {t['entry_slip_bps_p95']}",
        f"- escalations: {r['escalations']}, judge errors: {r['judge_errors']}, halts: {r['halts']}",
        f"- latency ms p50/p95: {r['latency_ms']['p50']} / {r['latency_ms']['p95']}",
        "", "## Reliability (judge, top-class probability -> hit rate)", "",
        "| bucket | n | hit rate |", "|---|---|---|",
    ]
    for k, v in j.get("reliability", {}).items():
        lines.append(f"| {k} | {v['n']} | {v['hit_rate']:.2f} |")
    lines += ["", "## Misses by failing gate (moves larger than threshold afterwards)", "",
              "| gate | n | big move after |", "|---|---|---|"]
    for k, v in sorted(r["misses"].items()):
        lines.append(f"| {k} | {v['n']} | {v['abs_move_gt_threshold']} |")
    return "\n".join(lines) + "\n"


def propose_schema(schema: JevSchema, report: dict, out_dir: str | Path) -> Path:
    """Write schemas/candidates/<id>.v<N+1>.json. With TRADEAGENT_REVIEW_WITH_OPUS=1, Opus rewrites the
    field questions / thesis / invalidation text; kinds and options are fixed by REQUIRED_FIELDS and
    re-validated on load, so a rewrite cannot change what the judge may answer."""
    d = schema_to_dict(schema)
    d["version"] = schema.version + 1
    d["changelog"] = f"auto-candidate from review; verdict: {report['verdict']}"
    if os.environ.get("TRADEAGENT_REVIEW_WITH_OPUS") == "1":
        d = _opus_rewrite(d, report) or d
    out = Path(out_dir) / f"{schema.schema_id}.v{d['version']}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(d, indent=2) + "\n")
    load_schema(out)   # must validate
    return out


def _opus_rewrite(d: dict, report: dict) -> dict | None:
    try:
        import anthropic
    except ImportError:
        return None
    names = [f["name"] for f in d["fields"]]
    schema = {
        "type": "object",
        "properties": {
            "thesis": {"type": "string"}, "invalidation": {"type": "string"},
            "questions": {"type": "object", "properties": {n: {"type": "string"} for n in names},
                          "required": names, "additionalProperties": False},
            "changelog": {"type": "string"},
        },
        "required": ["thesis", "invalidation", "questions", "changelog"],
        "additionalProperties": False,
    }
    summary = {k: report[k] for k in ("judge", "baseline", "trades", "misses", "verdict")}
    client = anthropic.Anthropic()
    try:
        with client.beta.messages.stream(
            model="claude-opus-5-5", max_tokens=32000, thinking={"type": "adaptive"},
            output_config={"effort": "high", "format": {"type": "json_schema", "schema": schema}},
            betas=["server-side-fallback-2026-07-01"], fallbacks="default",
            system=("You maintain the question wording for a fast typed classifier used by a trading "
                    "agent. Improve calibration, not aggressiveness: when the review shows "
                    "over-confidence, make questions stricter. Never suggest larger sizes or looser "
                    "gates; those live in code you cannot change. Keep each question under 50 words."),
            messages=[{"role": "user", "content": json.dumps({"current_schema": d, "review": summary})}],
        ) as stream:
            msg = stream.get_final_message()
    except anthropic.APIError:
        return None
    if msg.stop_reason in ("refusal", "max_tokens"):
        return None
    try:
        out = json.loads(next(b.text for b in msg.content if b.type == "text"))
    except (StopIteration, ValueError):
        return None
    new = dict(d)
    new["thesis"], new["invalidation"] = out["thesis"][:500], out["invalidation"][:500]
    new["fields"] = [dict(f, question=out["questions"][f["name"]][:400]) for f in d["fields"]]
    new["changelog"] = out["changelog"][:1000]
    return new


def write_review(journal_path: str | Path, schema: JevSchema, out_root: str | Path,
                 candidates_dir: str | Path, date: str) -> dict:
    r = review(journal_path)
    out = Path(out_root) / date
    out.mkdir(parents=True, exist_ok=True)
    (out / "report.json").write_text(json.dumps(r, indent=2, default=str) + "\n")
    (out / "report.md").write_text(to_markdown(r))
    cal = propose_calibration(r["trade_list"])
    if cal:
        (out / "calibration.json").write_text(json.dumps(cal) + "\n")
    r["candidate"] = str(propose_schema(schema, r, candidates_dir))
    return r
