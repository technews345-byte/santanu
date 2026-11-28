"""Policy: turns a validated Decision into an intent. Owns gates, stop/target geometry and sizing.

Order of evaluation (first match wins):
  1. Escalate   - direction confidence < 0.60, or regime == crisis. No new entries. In crisis with
                  an open position, also exit (reducing risk never needs permission).
  2. Gate       - setup_quality >= 2, P(direction) > 0.80, risk_state == safe, not toxic_flow,
                  direction != neutral, shorting allowed if short. Any miss -> HOLD (logged as a
                  "miss" with the failing gate, so the nightly review can score missed trades).
  3. Size       - fractional Kelly on the CALIBRATED probability, net of fees and slippage,
                  capped at quarter Kelly and at max risk per trade. Edge must beat 2x costs.
"""
from __future__ import annotations

import bisect
import math
from dataclasses import dataclass, field

from .config import GateConfig, RiskLimits
from .jev_schema import Decision


@dataclass(frozen=True)
class SetupParams:
    stop_vol_mult: float = 1.5       # stop = mult * hourly realised vol
    reward_risk: float = 3.0         # target distance / stop distance (1:3 risk-reward)
    min_stop_bps: float = 40.0
    max_stop_bps: float = 600.0

    def __post_init__(self) -> None:
        if not 1.0 <= self.reward_risk <= 10.0:
            raise ValueError("reward_risk must be between 1 and 10 (target = reward_risk x stop distance)")
        if not 0 < self.min_stop_bps <= self.max_stop_bps:
            raise ValueError("need 0 < min_stop_bps <= max_stop_bps")


@dataclass
class Calibrator:
    """Maps a raw judge probability to P(trade reaches target before stop).

    Until the nightly review has produced a table from real outcomes, apply a haircut toward 0.5.
    A table is a list of (raw_p_bucket_centre, empirical_win_rate) points.
    """
    haircut: float = 0.05
    table: list[tuple[float, float]] = field(default_factory=list)

    def __call__(self, p: float) -> float:
        base = 0.5 + (p - 0.5) * (1 - self.haircut)
        if len(self.table) < 2:
            return base
        xs = [x for x, _ in self.table]
        ys = [y for _, y in self.table]
        if p <= xs[0]:
            emp = ys[0]
        elif p >= xs[-1]:
            emp = ys[-1]
        else:
            i = bisect.bisect_right(xs, p)
            x0, x1, y0, y1 = xs[i - 1], xs[i], ys[i - 1], ys[i]
            emp = y0 + (y1 - y0) * (p - x0) / (x1 - x0)
        return min(base, emp)   # calibration may only make us MORE conservative automatically


@dataclass(frozen=True)
class Intent:
    kind: str                     # "hold" | "enter" | "exit"
    reason: str
    escalate: bool = False
    side: str | None = None       # "buy" | "sell"
    risk_frac: float = 0.0        # fraction of equity lost if stopped (before risk-layer clip)
    stop_price: float | None = None
    target_price: float | None = None
    p_raw: float | None = None
    p_cal: float | None = None
    kelly_full: float | None = None
    failed_gates: tuple[str, ...] = ()


def kelly_fraction(p: float, b: float) -> float:
    """Full Kelly for a bet that wins b per unit risked with prob p, loses 1 otherwise."""
    if b <= 0:
        return 0.0
    return p - (1 - p) / b


def decide(decision: Decision, snap: dict, has_position: bool, position_side: int,
           gates: GateConfig, limits: RiskLimits, cost_bps: float, min_edge_mult: float,
           setup: SetupParams, calibrator: Calibrator, allow_short: bool) -> Intent:
    """cost_bps: round-trip fees + slippage for this market, from MarketProfile.round_trip_cost_bps."""
    d = decision
    p_dir = d.direction.p

    # 1. escalation
    if d.regime.value == "crisis" or p_dir < gates.escalate_below_conf:
        why = "regime=crisis" if d.regime.value == "crisis" else f"p_dir={p_dir:.2f}<{gates.escalate_below_conf}"
        if has_position and d.regime.value == "crisis":
            return Intent("exit", f"escalate+exit: {why}", escalate=True, p_raw=p_dir)
        return Intent("hold", f"escalate: {why}", escalate=True, p_raw=p_dir)

    # Exit an open position when the judge flips against it with conviction, or risk says reduce.
    if has_position:
        against = (position_side > 0 and d.direction.value == "short") or \
                  (position_side < 0 and d.direction.value == "long")
        if d.risk_state.value == "reduce" or (against and p_dir > gates.min_direction_conf):
            return Intent("exit", f"exit: risk_state={d.risk_state.value}, direction={d.direction.value}",
                          p_raw=p_dir)
        return Intent("hold", "in position; stops/targets managed by broker", p_raw=p_dir)

    # 2. gates
    failed = []
    if d.setup_quality.value < gates.min_setup_quality:
        failed.append(f"setup_quality={d.setup_quality.value}")
    if not p_dir > gates.min_direction_conf:
        failed.append(f"p_dir={p_dir:.2f}")
    if d.risk_state.value != "safe":
        failed.append(f"risk_state={d.risk_state.value}")
    if d.toxic_flow.value:
        failed.append("toxic_flow")
    if d.direction.value == "neutral":
        failed.append("neutral")
    if d.direction.value == "short" and not allow_short:
        failed.append("short_disabled")
    if failed:
        return Intent("hold", "gated", p_raw=p_dir, failed_gates=tuple(failed))

    # 3. geometry + sizing (all in code)
    mid = snap["mid"]
    rv60 = snap.get("rv60_bps")
    if rv60 is None:
        return Intent("hold", "no realised vol yet", p_raw=p_dir, failed_gates=("rv_missing",))
    stop_bps = min(setup.max_stop_bps, max(setup.min_stop_bps, setup.stop_vol_mult * rv60 * math.sqrt(60)))
    b_eff = (setup.reward_risk * stop_bps - cost_bps) / (stop_bps + cost_bps)
    p_cal = calibrator(p_dir)
    f_full = kelly_fraction(p_cal, b_eff)
    exp_edge_bps = p_cal * (setup.reward_risk * stop_bps - cost_bps) - (1 - p_cal) * (stop_bps + cost_bps)
    if f_full <= 0 or exp_edge_bps < min_edge_mult * cost_bps:
        return Intent("hold", f"edge {exp_edge_bps:.1f}bps does not clear costs", p_raw=p_dir, p_cal=p_cal,
                      kelly_full=f_full, failed_gates=("edge_vs_cost",))
    f = min(gates.kelly_multiplier, gates.KELLY_CAP) * f_full
    risk_frac = min(f, limits.max_risk_per_trade_frac)

    long = d.direction.value == "long"
    sgn = 1 if long else -1
    stop = mid * (1 - sgn * stop_bps / 1e4)
    target = mid * (1 + sgn * setup.reward_risk * stop_bps / 1e4)
    return Intent("enter", f"gates passed; stop {stop_bps:.0f}bps, b_eff {b_eff:.2f}",
                  side="buy" if long else "sell", risk_frac=risk_frac, stop_price=stop,
                  target_price=target, p_raw=p_dir, p_cal=p_cal, kelly_full=f_full)
