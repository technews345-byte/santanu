"""Every threshold, size and limit lives here, in code. The judge model never sets any of them.

Values are frozen dataclasses so nothing at runtime (including anything parsed from a model
response) can mutate them. The nightly review may *propose* new values; only the operator
promotes them (see review.py and docs/02-plan.md, gate G6).
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class RiskLimits:
    max_drawdown: float = 0.15          # 15% peak-to-trough on equity -> kill switch trips
    max_daily_loss: float = 0.03        # 3% of start-of-day equity -> no new risk until next UTC day
    max_position_notional_frac: float = 0.20   # one symbol's |notional| <= 20% of equity
    max_gross_exposure_frac: float = 0.50      # sum of |notional| <= 50% of equity
    max_risk_per_trade_frac: float = 0.01      # loss-at-stop per trade <= 1% of equity
    max_orders_per_hour: int = 12
    max_spread_bps: float = 15.0        # do not open into a wide book
    max_snapshot_age_ms: int = 2_000    # stale data -> no new orders
    allow_short: bool = False           # spot/paper default; perps shorting is an explicit opt-in

    def __post_init__(self) -> None:
        if not 0 < self.max_drawdown <= 0.15:
            raise ValueError("max_drawdown must be in (0, 0.15]; the spec caps it at 15%")
        for name in ("max_daily_loss", "max_position_notional_frac",
                     "max_gross_exposure_frac", "max_risk_per_trade_frac"):
            v = getattr(self, name)
            if not 0 < v <= 1:
                raise ValueError(f"{name} must be in (0, 1]")


@dataclass(frozen=True)
class GateConfig:
    min_setup_quality: int = 2          # fire only when setup_quality >= 2
    min_direction_conf: float = 0.80    # and P(direction) > 0.80
    escalate_below_conf: float = 0.60   # below this -> escalate to Opus, no new entries
    kelly_multiplier: float = 0.25      # fractional Kelly; hard-capped at 0.25 below
    calibration_haircut: float = 0.05   # shave probabilities toward 0.5 until calibration data exists

    KELLY_CAP: float = field(default=0.25, init=False, repr=False)

    def __post_init__(self) -> None:
        if self.kelly_multiplier <= 0 or self.kelly_multiplier > self.KELLY_CAP:
            raise ValueError("kelly_multiplier must be in (0, 0.25] (quarter-Kelly cap)")
        if not 0.5 < self.min_direction_conf < 1:
            raise ValueError("min_direction_conf must be in (0.5, 1)")
        if self.min_setup_quality < 2:
            raise ValueError("min_setup_quality must be >= 2 per spec")


@dataclass(frozen=True)
class CostModel:
    """Fees and slippage come from the MarketProfile (markets.py). This only holds the hurdle."""
    min_edge_over_cost_mult: float = 2.0  # expected edge must be >= 2x round-trip cost


@dataclass(frozen=True)
class Mode:
    """paper is the default. live requires TRADEAGENT_MODE=live AND an operator approval file."""
    name: str = "paper"
