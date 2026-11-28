"""Escalation to the slow, deep model (Claude Opus 5.5) when the fast judge is unsure or the regime is crisis.

What an escalation can do: return one of HOLD (keep new entries paused), FLATTEN (close the
symbol), or RESUME (lift the pause). It cannot change limits, sizes or thresholds; the loop
only ever applies these three risk-neutral-or-reducing actions. While an escalation is open,
new entries for that symbol are paused (default 60 min).

Escalations are rate-limited per symbol so a choppy market cannot run up a large API bill.
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Protocol

from .journal import Journal

ACTIONS = ("hold", "flatten", "resume")

OPUS_MODEL = "claude-opus-5-5"

_SYSTEM = (
    "You are the risk reviewer for an automated crypto trading agent. A fast classifier was "
    "unsure, or flagged a crisis regime, on the market snapshot below. You cannot change limits, "
    "sizes or thresholds. Choose exactly one action: 'hold' keeps new entries paused, 'flatten' "
    "closes the open position in this symbol, 'resume' lets the fast loop continue. Prefer 'hold' "
    "when evidence is mixed. Prefer 'flatten' only if the snapshot shows the thesis's invalidation "
    "condition is met or risk is rising fast. Keep the rationale under 80 words."
)

_OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "action": {"type": "string", "enum": list(ACTIONS)},
        "pause_minutes": {"type": "integer", "enum": [15, 30, 60, 120, 240]},
        "rationale": {"type": "string"},
    },
    "required": ["action", "pause_minutes", "rationale"],
    "additionalProperties": False,
}


@dataclass(frozen=True)
class EscalationResult:
    action: str
    pause_minutes: int
    rationale: str
    source: str


class Escalator(Protocol):
    def escalate(self, symbol: str, reason: str, snapshot: dict, decision: dict | None,
                 thesis: str, invalidation: str) -> EscalationResult: ...


class QueueEscalator:
    """No model call: pause entries and leave a record for the operator / a Claude Code session."""

    def __init__(self, journal: Journal, pause_minutes: int = 60):
        self.journal, self.pause = journal, pause_minutes

    def escalate(self, symbol, reason, snapshot, decision, thesis, invalidation) -> EscalationResult:
        return EscalationResult("hold", self.pause, f"queued for review: {reason}", "queue")


class OpusEscalator:
    """Deep re-read via the Anthropic API. Any failure degrades to HOLD."""

    def __init__(self, effort: str = "high", timeout_s: float = 120.0):
        import anthropic  # optional dependency: pip install 'tradeagent[brain]'
        self.client = anthropic.Anthropic(timeout=timeout_s, max_retries=1)
        self.effort = effort

    def escalate(self, symbol, reason, snapshot, decision, thesis, invalidation) -> EscalationResult:
        import anthropic
        user = (f"symbol: {symbol}\nwhy escalated: {reason}\nthesis: {thesis}\n"
                f"invalidation: {invalidation}\nfast-judge output: {json.dumps(decision)}\n"
                f"snapshot: {json.dumps(snapshot, separators=(',', ':'))}")
        try:
            resp = self.client.beta.messages.create(
                model=OPUS_MODEL,
                max_tokens=16000,
                thinking={"type": "adaptive"},
                output_config={"effort": self.effort,
                               "format": {"type": "json_schema", "schema": _OUTPUT_SCHEMA}},
                betas=["server-side-fallback-2026-07-01"],
                fallbacks="default",
                system=_SYSTEM,
                messages=[{"role": "user", "content": user}],
            )
        except anthropic.APIError as e:
            return EscalationResult("hold", 60, f"escalation call failed: {type(e).__name__}", "error")
        if resp.stop_reason in ("refusal", "max_tokens"):
            return EscalationResult("hold", 60, f"escalation stop_reason={resp.stop_reason}", "error")
        try:
            text = next(b.text for b in resp.content if b.type == "text")
            out = json.loads(text)
            if out["action"] not in ACTIONS:
                raise ValueError(out["action"])
            return EscalationResult(out["action"], int(out["pause_minutes"]), out["rationale"][:600], resp.model)
        except (StopIteration, ValueError, KeyError, TypeError):
            return EscalationResult("hold", 60, "unparseable escalation output", "error")


def make_escalator(journal: Journal) -> Escalator:
    if os.environ.get("TRADEAGENT_ESCALATE_TO_OPUS") == "1":
        try:
            return OpusEscalator()
        except ImportError:
            pass
    return QueueEscalator(journal)
