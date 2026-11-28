"""Append-only JSONL journal. Every snapshot, decision, intent, risk verdict, fill and escalation is
written here; the nightly review reads nothing else."""
from __future__ import annotations

import dataclasses
import json
from enum import Enum
from pathlib import Path
from typing import Iterator


def _default(o):
    if dataclasses.is_dataclass(o):
        return dataclasses.asdict(o)
    if isinstance(o, Enum):
        return o.value
    raise TypeError(type(o))


class Journal:
    def __init__(self, path: str | Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def write(self, kind: str, ts_ms: int, **data) -> None:
        with self.path.open("a") as f:
            f.write(json.dumps({"kind": kind, "ts": ts_ms, **data}, default=_default,
                               separators=(",", ":")) + "\n")

    def read(self) -> Iterator[dict]:
        if not self.path.exists():
            return
        with self.path.open() as f:
            for line in f:
                line = line.strip()
                if line:
                    yield json.loads(line)
