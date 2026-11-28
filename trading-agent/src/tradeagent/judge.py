"""Judge clients. The judge only judges: snapshot + schema in, typed Decision out.

* HttpJevClient  - TypeSafe AI's Jev over HTTP. The vendor's request/response contract could NOT
                   be verified from this build environment (typesafe.ai did not resolve), so the
                   endpoint, model name and payload mapping below are configuration, marked
                   UNVERIFIED, and must be checked against the official docs at gate G2 before use.
                   Any response that does not validate raises, and the loop holds.
* BaselineJudge  - deterministic rules on the same snapshot. Used for tests, for paper runs before
                   a key exists, and as the benchmark the nightly review compares Jev against.
                   It is NOT an edge; it is a yardstick.
"""
from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from typing import Protocol

from .jev_schema import Decision, JevSchema, JudgeOutputError, parse_decision, schema_to_dict
from .state_engine import serialize


class Judge(Protocol):
    def decide(self, schema: JevSchema, snapshot: dict) -> Decision: ...


class JudgeUnavailable(RuntimeError):
    pass


# UNVERIFIED defaults, taken from secondary coverage of Jev (not from vendor docs). Override via env.
DEFAULT_JEV_URL = os.environ.get("JEV_URL", "https://api.typesafe.ai/v1/systemone")
DEFAULT_JEV_MODEL = os.environ.get("JEV_MODEL", "jev-latest")


class HttpJevClient:
    def __init__(self, api_key: str | None = None, url: str = DEFAULT_JEV_URL,
                 model: str = DEFAULT_JEV_MODEL, timeout_s: float = 0.5):
        self.api_key = api_key or os.environ.get("TYPESAFE_API_KEY")
        if not self.api_key:
            raise JudgeUnavailable("TYPESAFE_API_KEY not set")
        self.url, self.model, self.timeout_s = url, model, timeout_s

    def build_request(self, schema: JevSchema, snapshot: dict) -> dict:
        s = schema_to_dict(schema)
        return {
            "model": self.model,
            "input": serialize(snapshot),
            "context": f"thesis: {s['thesis']} | invalidation: {s['invalidation']}",
            "outputs": [
                {"name": f["name"], "type": f["kind"], "options": f["options"],
                 "question": f["question"], "return_probabilities": True}
                for f in s["fields"]
            ],
        }

    def map_response(self, body: dict) -> dict:
        """Vendor body -> internal {"fields": {name: {"value", "probs"}}}. Adjust at gate G2."""
        if "fields" in body:
            return body
        outs = body.get("outputs")
        if isinstance(outs, list):
            return {"fields": {o["name"]: {"value": o.get("value"),
                                            "probs": o.get("probabilities") or o.get("probs")}
                               for o in outs if isinstance(o, dict) and "name" in o}}
        raise JudgeOutputError("unrecognised Jev response shape")

    def decide(self, schema: JevSchema, snapshot: dict) -> Decision:
        payload = json.dumps(self.build_request(schema, snapshot)).encode()
        req = urllib.request.Request(self.url, data=payload, method="POST", headers={
            "Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"})
        t0 = time.perf_counter()
        try:
            with urllib.request.urlopen(req, timeout=self.timeout_s) as r:
                body = json.loads(r.read())
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
            raise JudgeUnavailable(str(e)) from e
        latency = (time.perf_counter() - t0) * 1000
        return parse_decision(schema, self.map_response(body), latency)


def _dist(options: tuple, winner, p: float) -> dict:
    rest = (1 - p) / (len(options) - 1)
    return {o: (p if o == winner else rest) for o in options}


class BaselineJudge:
    """Transparent rules. Probabilities are heuristic, not calibrated; the review measures them."""

    def decide(self, schema: JevSchema, snapshot: dict) -> Decision:
        t0 = time.perf_counter()
        rv = snapshot.get("rv60_bps") or 0.0
        r1h = snapshot.get("r1h_bps") or 0.0
        r4h = snapshot.get("r4h_bps") or 0.0
        flow = snapshot.get("flow5m") or 0.0
        imb = snapshot.get("imb10") or 0.0
        dd = snapshot.get("dd") or 0.0

        if r4h < -1500 or rv > 80:
            regime, rp = "crisis", 0.7
        elif rv > 40:
            regime, rp = "high_vol", 0.6
        elif abs(r4h) > 3 * max(rv, 1) * 2:
            regime, rp = "trending", 0.6
        else:
            regime, rp = "mean_reverting", 0.55

        score = 0.0
        score += max(-1, min(1, r1h / 150)) * 0.4
        score += max(-1, min(1, flow)) * 0.35
        score += max(-1, min(1, imb)) * 0.25
        direction = "long" if score > 0.15 else "short" if score < -0.15 else "neutral"
        dp = min(0.95, 0.5 + abs(score) * 0.5) if direction != "neutral" else 0.6

        toxic = abs(flow) > 0.7 and (snapshot.get("spr_bps") or 0) > 8
        q = 0 if direction == "neutral" else (3 if abs(score) > 0.75 else 2 if abs(score) > 0.45 else 1)
        risk_state = "reduce" if dd > 0.10 else "near_limit" if dd > 0.06 else "safe"

        raw = {"fields": {
            "regime": {"value": regime, "probs": _dist(REG, regime, rp)},
            "direction": {"value": direction, "probs": _dist(DIR, direction, dp)},
            "toxic_flow": {"value": toxic, "probs": _dist((True, False), toxic, 0.7)},
            "setup_quality": {"value": q, "probs": _dist((0, 1, 2, 3), q, 0.6)},
            "risk_state": {"value": risk_state, "probs": _dist(RISK, risk_state, 0.8)},
        }}
        return parse_decision(schema, raw, (time.perf_counter() - t0) * 1000)


REG = ("trending", "mean_reverting", "high_vol", "crisis")
DIR = ("long", "short", "neutral")
RISK = ("safe", "near_limit", "reduce")
