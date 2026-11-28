"""The live loop. One Agent per symbol; call on_book / on_trade as events arrive and step() on every
candle close. Order of operations in step():

  marks -> risk.update_marks (may trip kill switch) -> kill switch? flatten & stop
  -> snapshot (causal) -> judge (one call, all fields) -> shadow baseline (for the review)
  -> policy intent -> escalation (if asked) -> risk.check -> broker -> journal everything
"""
from __future__ import annotations

from dataclasses import dataclass, field

from .broker import Broker
from .markets import CRYPTO_SPOT, MarketProfile
from .config import CostModel, GateConfig, RiskLimits
from .escalation import Escalator
from .jev_schema import JevSchema, JudgeOutputError
from .journal import Journal
from .judge import BaselineJudge, Judge, JudgeUnavailable
from .policy import Calibrator, Intent, SetupParams, decide
from .risk import RiskEngine
from .state_engine import CausalityError, StateEngine
from .models import Account, Order, OrderBook, Side, Trade


@dataclass
class AgentConfig:
    limits: RiskLimits = field(default_factory=RiskLimits)
    gates: GateConfig = field(default_factory=GateConfig)
    costs: CostModel = field(default_factory=CostModel)
    setup: SetupParams = field(default_factory=SetupParams)
    escalation_cooldown_ms: int = 30 * 60_000
    market: MarketProfile = CRYPTO_SPOT


class Agent:
    def __init__(self, schema: JevSchema, engine: StateEngine, judge: Judge, broker: Broker,
                 account: Account, risk: RiskEngine, escalator: Escalator, journal: Journal,
                 cfg: AgentConfig | None = None, calibrator: Calibrator | None = None):
        self.schema, self.engine, self.judge, self.broker = schema, engine, judge, broker
        self.acct, self.risk, self.escalator, self.journal = account, risk, escalator, journal
        self.cfg = cfg or AgentConfig()
        self.cal = calibrator or Calibrator(haircut=self.cfg.gates.calibration_haircut)
        self.shadow = BaselineJudge()
        self.book: OrderBook | None = None
        self.paused_until_ms = 0
        self.last_escalation_ms = -10**15
        self._oid = 0

    @property
    def symbol(self) -> str:
        return self.engine.symbol

    # ---- events ----------------------------------------------------------------------------
    def on_book(self, book: OrderBook) -> None:
        self.engine.on_book(book)
        self.book = book
        for f in self.broker.on_book(book):
            self.journal.write("fill", book.ts_ms, fill=f, why="stop_or_target")

    def on_trade(self, trade: Trade) -> None:
        self.engine.on_trade(trade)

    # ---- helpers ---------------------------------------------------------------------------
    def _next_id(self) -> str:
        self._oid += 1
        return f"{self.symbol}-{self._oid}"

    def _flatten(self, now_ms: int, why: str) -> None:
        pos = self.acct.positions.get(self.symbol)
        if not pos or not self.book:
            return
        side = Side.SELL if pos.qty > 0 else Side.BUY
        o = Order(self._next_id(), self.symbol, side, abs(pos.qty), None,
                  stop_price=0.0, target_price=0.0, reason=why, reduce_only=True)
        marks = {self.symbol: self.engine.snapshot_mid(self.book)}
        v = self.risk.check(o, self.acct, marks, now_ms, 0, 0.0)
        self.journal.write("risk", now_ms, order=o, verdict=v)
        if v.approved:
            f = self.broker.submit(o, v.qty, self.book)
            self.journal.write("fill", now_ms, fill=f, why=why)

    # ---- the candle step -------------------------------------------------------------------
    def step(self, asof_ms: int) -> Intent | None:
        if self.book is None:
            return None
        mid = self.engine.snapshot_mid(self.book)
        marks = {self.symbol: mid}
        M = self.cfg.market
        self.risk.update_marks(self.acct, marks, M.trading_day_key(asof_ms))

        if self.risk.kill.tripped:
            self._flatten(asof_ms, "kill switch")
            self.journal.write("halt", asof_ms, reason="kill switch tripped")
            return Intent("exit", "kill switch")

        if not M.is_open(asof_ms):
            return None
        if M.must_flatten(asof_ms):
            if self.acct.positions.get(self.symbol):
                self._flatten(asof_ms, f"{M.name}: flat-by time")
            return Intent("hold", "past flat-by; no new entries today")

        try:
            snap = self.engine.snapshot(asof_ms, self.acct, marks)
        except CausalityError as e:
            self.journal.write("error", asof_ms, error=f"causality: {e}")
            return Intent("hold", "causality error")
        self.journal.write("snapshot", asof_ms, snap=snap)

        pos = self.acct.positions.get(self.symbol)
        has_pos, pos_side = bool(pos), (1 if pos and pos.qty > 0 else -1 if pos else 0)

        try:
            dec = self.judge.decide(self.schema, snap)
        except (JudgeUnavailable, JudgeOutputError) as e:
            self.journal.write("judge_error", asof_ms, error=str(e))
            intent = Intent("hold", f"judge error: {type(e).__name__}", escalate=True)
            dec = None
        else:
            self.journal.write("decision", asof_ms, decision=dec.to_log())
            eq_now = self.acct.equity(marks)
            cost_bps = M.round_trip_cost_bps(0.5 * self.cfg.limits.max_position_notional_frac * eq_now)
            intent = decide(dec, snap, has_pos, pos_side, self.cfg.gates, self.cfg.limits,
                            cost_bps, self.cfg.costs.min_edge_over_cost_mult, self.cfg.setup,
                            self.cal, allow_short=self.cfg.limits.allow_short and M.allow_short)
        try:
            sh = self.shadow.decide(self.schema, snap)
            self.journal.write("shadow", asof_ms, decision=sh.to_log())
        except JudgeOutputError:
            pass

        if intent.escalate and asof_ms - self.last_escalation_ms >= self.cfg.escalation_cooldown_ms:
            self.last_escalation_ms = asof_ms
            res = self.escalator.escalate(self.symbol, intent.reason, snap,
                                          dec.to_log() if dec else None,
                                          self.schema.thesis, self.schema.invalidation)
            self.journal.write("escalation", asof_ms, reason=intent.reason, result=res)
            if res.action == "flatten":
                self._flatten(asof_ms, "escalation: flatten")
            if res.action in ("hold", "flatten"):
                self.paused_until_ms = asof_ms + res.pause_minutes * 60_000
            elif res.action == "resume":
                self.paused_until_ms = 0

        self.journal.write("intent", asof_ms, intent=intent)

        if intent.kind == "exit":
            self._flatten(asof_ms, intent.reason)
        elif intent.kind == "enter":
            if asof_ms < self.paused_until_ms:
                self.journal.write("skip", asof_ms, reason="entries paused by escalation")
                return intent
            eq = self.acct.equity(marks)
            stop_dist = abs(mid - intent.stop_price)
            qty = intent.risk_frac * eq / stop_dist
            o = Order(self._next_id(), self.symbol, Side(intent.side), qty, None,
                      intent.stop_price, intent.target_price, intent.reason)
            ctx = snap.get("ctx", {})
            v = self.risk.check(o, self.acct, marks, asof_ms, snap["age_ms"], snap["spr_bps"],
                                ctx.get("band_lo"), ctx.get("band_hi"))
            self.journal.write("risk", asof_ms, order=o, verdict=v)
            if v.approved:
                f = self.broker.submit(o, v.qty, self.book)
                if f:
                    self.journal.write("fill", asof_ms, fill=f, why="entry", p_cal=intent.p_cal,
                                       p_raw=intent.p_raw, decision_mid=mid)
        return intent
