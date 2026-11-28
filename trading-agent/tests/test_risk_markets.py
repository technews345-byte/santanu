import inspect
from datetime import datetime

import pytest

from tradeagent.config import RiskLimits
from tradeagent.markets import CRYPTO_SPOT, IST, NSE_EQUITY_INTRADAY as NSE
from tradeagent.models import Account, Order, Position, Side
from tradeagent.risk import KillSwitch, RiskEngine


def ist_ms(s):
    return int(datetime.fromisoformat(s).replace(tzinfo=IST).timestamp() * 1000)


MON_1000 = ist_ms("2026-11-30T10:00")          # Monday, trading day
CRYPTO_T = 1_764_288_000_000


def engine(tmp_path, market=CRYPTO_SPOT, **lim):
    return RiskEngine(RiskLimits(**lim), KillSwitch(tmp_path / "KILL"), market)


def acct(cash=10_000.0):
    return Account(cash=cash, peak_equity=cash, day_start_equity=cash, day="x")


def buy(qty, stop=95.0, sym="X"):
    return Order("o1", sym, Side.BUY, qty, None, stop, 110.0, "t")


# ---- isolation from the model -------------------------------------------------------------
def test_risk_check_has_no_access_to_model_output():
    params = set(inspect.signature(RiskEngine.check).parameters)
    assert not params & {"decision", "intent", "probability", "confidence", "judge"}


def test_limits_cannot_exceed_spec():
    with pytest.raises(ValueError):
        RiskLimits(max_drawdown=0.20)


# ---- kill switch --------------------------------------------------------------------------
def test_drawdown_trips_latching_kill_switch(tmp_path):
    r = engine(tmp_path)
    a = acct()
    a.positions["X"] = Position("X", qty=100, avg_price=100)
    a.cash = 0
    r.update_marks(a, {"X": 100}, "d")
    r.update_marks(a, {"X": 84.9}, "d")                    # >15% drawdown
    assert r.kill.tripped and (tmp_path / "KILL").exists()
    v = r.check(buy(1), a, {"X": 100}, CRYPTO_T, 0, 1.0)
    assert not v.approved and "kill" in v.reason
    flat = Order("o2", "X", Side.SELL, 100, None, 0, 0, "flatten", reduce_only=True)
    assert r.check(flat, a, {"X": 85}, CRYPTO_T, 0, 1.0).approved     # reducing still allowed
    r.update_marks(a, {"X": 100}, "d")                    # recovery does not un-trip it
    assert r.kill.tripped


def test_kill_switch_reset_needs_ack(tmp_path):
    k = KillSwitch(tmp_path / "KILL")
    k.trip("test")
    with pytest.raises(PermissionError):
        k.reset(operator_ack=False)
    k.reset(operator_ack=True)
    assert not k.tripped


def test_manual_kill_file_trips(tmp_path):
    r = engine(tmp_path)
    (tmp_path / "KILL").write_text("operator")
    assert not r.check(buy(1), acct(), {"X": 100}, CRYPTO_T, 0, 1.0).approved


# ---- limits -------------------------------------------------------------------------------
def test_daily_loss_blocks_new_risk(tmp_path):
    r = engine(tmp_path)
    a = acct()
    a.cash = 9_650                                        # -3.5% on the day
    assert r.check(buy(1), a, {"X": 100}, CRYPTO_T, 0, 1.0).reason == "daily loss limit"


def test_quantity_clipped_by_risk_per_trade_and_position_cap(tmp_path):
    r = engine(tmp_path)
    v = r.check(buy(1_000, stop=95), acct(), {"X": 100}, CRYPTO_T, 0, 1.0)
    # 1% risk / $5 per unit = 20 units; 20% position cap = 20 units -> 20
    assert v.approved and v.qty == pytest.approx(20)


def test_stale_wide_and_wrong_side_stop_rejected(tmp_path):
    r = engine(tmp_path)
    assert "stale" in r.check(buy(1), acct(), {"X": 100}, CRYPTO_T, 10_000, 1.0).reason
    assert "spread" in r.check(buy(1), acct(), {"X": 100}, CRYPTO_T, 0, 50.0).reason
    assert "stop" in r.check(buy(1, stop=101), acct(), {"X": 100}, CRYPTO_T, 0, 1.0).reason


def test_shorting_off_by_default(tmp_path):
    r = engine(tmp_path)
    o = Order("o", "X", Side.SELL, 1, None, 105, 90, "t")
    assert r.check(o, acct(), {"X": 100}, CRYPTO_T, 0, 1.0).reason == "shorting disabled"


# ---- NSE profile --------------------------------------------------------------------------
def test_nse_session_rules():
    assert NSE.can_enter(MON_1000)
    assert not NSE.can_enter(ist_ms("2026-11-30T09:20"))      # before 9:30 entry window
    assert not NSE.can_enter(ist_ms("2026-11-30T14:50"))      # after 14:45
    assert NSE.must_flatten(ist_ms("2026-11-30T15:16"))
    assert not NSE.is_open(ist_ms("2026-11-28T10:00"))        # Saturday
    assert not NSE.is_open(ist_ms("2026-12-25T10:00"))        # Christmas holiday
    assert not NSE.is_open(ist_ms("2027-01-04T10:00"))        # no 2027 calendar loaded: closed


def test_nse_whole_shares_and_window_in_risk(tmp_path):
    r = engine(tmp_path, market=NSE)
    a = acct(1_000_000)
    v = r.check(buy(37.7, stop=2_450.0, sym="ONGC"), a, {"ONGC": 2_500.0}, MON_1000, 0, 2.0)
    assert v.approved and v.qty == int(v.qty)
    late = r.check(buy(10, stop=2_450.0, sym="ONGC"), a, {"ONGC": 2_500.0}, ist_ms("2026-11-30T15:00"), 0, 2.0)
    assert not late.approved


def test_nse_circuit_band(tmp_path):
    r = engine(tmp_path, market=NSE)
    v = r.check(buy(10, stop=95, sym="S"), acct(1_000_000), {"S": 100}, MON_1000, 0, 2.0,
                band_lo=90.0, band_hi=100.5)
    assert "circuit" in v.reason


def test_zerodha_charges():
    buy_fee = NSE.fee("buy", 100_000)
    sell_fee = NSE.fee("sell", 100_000)
    # brokerage 20 (cap), txn 2.97, SEBI 0.10, stamp 3 (buy) / STT 25 (sell), GST 18% of 23.07
    assert buy_fee == pytest.approx(20 + 2.97 + 0.10 + 3 + 0.18 * 23.07, abs=0.01)
    assert sell_fee == pytest.approx(20 + 2.97 + 0.10 + 25 + 0.18 * 23.07, abs=0.01)
    assert NSE.round_trip_cost_bps(100_000) > CRYPTO_SPOT.round_trip_cost_bps(100_000) - 20
