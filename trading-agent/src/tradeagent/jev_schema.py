"""Typed decision schema for the fast judge ("Jev" or any model behind the Judge protocol).

The schema is data (schemas/*.json), versioned, and compiled per finalist. The judge returns, for
every field, a value AND a probability distribution over the allowed values. All fields are
asked in one call. The response is validated strictly: anything off-schema raises
JudgeOutputError and the loop treats that candle as HOLD + escalation. Fail closed.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

FieldKind = Literal["choice", "bool", "score"]

# The five fields the spec requires. A schema file may add descriptions and context,
# but may not remove, rename or retype these (enforced in JevSchema.__post_init__).
REQUIRED_FIELDS: dict[str, tuple[FieldKind, tuple]] = {
    "regime": ("choice", ("trending", "mean_reverting", "high_vol", "crisis")),
    "direction": ("choice", ("long", "short", "neutral")),
    "toxic_flow": ("bool", (True, False)),
    "setup_quality": ("score", (0, 1, 2, 3)),
    "risk_state": ("choice", ("safe", "near_limit", "reduce")),
}


class JudgeOutputError(ValueError):
    pass


@dataclass(frozen=True)
class FieldSpec:
    name: str
    kind: FieldKind
    options: tuple
    question: str


@dataclass(frozen=True)
class JevSchema:
    schema_id: str            # e.g. "btc-capitulation"
    version: int
    symbol: str
    thesis: str               # short; goes to the judge as context
    invalidation: str         # short; goes to the judge as context
    fields: tuple[FieldSpec, ...]
    market: str = "crypto_spot"

    def __post_init__(self) -> None:
        got = {f.name: (f.kind, tuple(f.options)) for f in self.fields}
        for name, spec in REQUIRED_FIELDS.items():
            if got.get(name) != spec:
                raise ValueError(f"schema {self.schema_id} v{self.version}: field {name!r} must be {spec}")

    @property
    def key(self) -> str:
        return f"{self.schema_id}@v{self.version}"


def load_schema(path: str | Path) -> JevSchema:
    d = json.loads(Path(path).read_text())
    fields = tuple(
        FieldSpec(f["name"], f["kind"], tuple(f["options"]), f["question"]) for f in d["fields"]
    )
    return JevSchema(d["schema_id"], int(d["version"]), d["symbol"], d["thesis"],
                     d["invalidation"], fields, d.get("market", "crypto_spot"))


def schema_to_dict(s: JevSchema) -> dict:
    return {
        "schema_id": s.schema_id, "version": s.version, "symbol": s.symbol, "market": s.market,
        "thesis": s.thesis, "invalidation": s.invalidation,
        "fields": [{"name": f.name, "kind": f.kind, "options": list(f.options),
                    "question": f.question} for f in s.fields],
    }


@dataclass(frozen=True)
class FieldResult:
    value: Any
    probs: dict          # option -> probability, sums to ~1

    @property
    def p(self) -> float:
        return float(self.probs[self.value])


@dataclass(frozen=True)
class Decision:
    schema_key: str
    regime: FieldResult
    direction: FieldResult
    toxic_flow: FieldResult
    setup_quality: FieldResult
    risk_state: FieldResult
    latency_ms: float

    def to_log(self) -> dict:
        return {k: {"value": getattr(self, k).value,
                    "probs": {str(o): round(float(p), 4) for o, p in getattr(self, k).probs.items()}}
                for k in REQUIRED_FIELDS} | {"schema": self.schema_key, "latency_ms": self.latency_ms}


def _coerce(kind: FieldKind, raw: Any) -> Any:
    if kind == "bool":
        if isinstance(raw, bool):
            return raw
        if raw in ("true", "True"):
            return True
        if raw in ("false", "False"):
            return False
    elif kind == "score":
        if isinstance(raw, bool):
            raise JudgeOutputError("bool given for score")
        if isinstance(raw, (int, str)) and str(raw).isdigit():
            return int(raw)
    elif kind == "choice" and isinstance(raw, str):
        return raw
    raise JudgeOutputError(f"cannot coerce {raw!r} to {kind}")


def parse_decision(schema: JevSchema, raw: dict, latency_ms: float) -> Decision:
    """raw: {"fields": {name: {"value": v, "probs": {option: p}}}} (internal contract;
    the HTTP adapter maps the vendor response into this shape)."""
    if not isinstance(raw, dict) or not isinstance(raw.get("fields"), dict):
        raise JudgeOutputError("missing 'fields'")
    out = {}
    for f in schema.fields:
        if f.name not in REQUIRED_FIELDS:
            continue
        item = raw["fields"].get(f.name)
        if not isinstance(item, dict) or "value" not in item or "probs" not in item:
            raise JudgeOutputError(f"field {f.name} missing value/probs")
        value = _coerce(f.kind, item["value"])
        if value not in f.options:
            raise JudgeOutputError(f"{f.name}={value!r} not in {f.options}")
        probs = {}
        for k, p in item["probs"].items():
            opt = _coerce(f.kind, k)
            if opt not in f.options:
                raise JudgeOutputError(f"{f.name}: prob for unknown option {k!r}")
            p = float(p)
            if not 0 <= p <= 1:
                raise JudgeOutputError(f"{f.name}: probability out of range")
            probs[opt] = p
        total = sum(probs.values())
        if not 0.98 <= total <= 1.02:
            raise JudgeOutputError(f"{f.name}: probabilities sum to {total:.3f}")
        probs = {o: probs.get(o, 0.0) / total for o in f.options}
        if value not in probs or probs[value] < max(probs.values()) - 1e-9:
            raise JudgeOutputError(f"{f.name}: value is not the argmax of its own probabilities")
        out[f.name] = FieldResult(value, probs)
    return Decision(schema.key, latency_ms=latency_ms, **out)
