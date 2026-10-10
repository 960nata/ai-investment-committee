"""
derivatives_toolkit.py — hitungan deterministik untuk futures crypto & analisis matematis binary option.
Hanya pakai pustaka standar Python. Pasangan dari trading_toolkit.py.

CATATAN: rumus likuidasi = pendekatan umum (USDT-margined linear, isolated).
Tiap bursa punya tier MMR, mark price, dan fee sendiri -> verifikasi ke dokumentasi bursa.
"""
from __future__ import annotations


# ---------- Futures ----------
def liquidation_price(entry, leverage, side="long", mmr=0.005):
    """Harga likuidasi isolated linear. side: 'long' | 'short'."""
    if leverage <= 0:
        raise ValueError("leverage harus > 0")
    if side == "long":
        return entry * (1 - 1 / leverage + mmr)
    if side == "short":
        return entry * (1 + 1 / leverage - mmr)
    raise ValueError("side harus 'long' atau 'short'")


def effective_leverage(total_notional, equity):
    """Leverage efektif akun = total notional semua posisi / ekuitas."""
    return total_notional / equity


def funding_cost(notional, rate_per_interval, intervals):
    """Biaya funding (positif = dibayar posisi Anda jika Anda di sisi yang membayar)."""
    return notional * rate_per_interval * intervals


def futures_position(equity, risk_pct, entry, stop, side="long", leverage=3.0,
                     mmr=0.005, fee_rate=0.0006, slippage_pct=0.0005,
                     buffer_ratio=0.5, max_effective_leverage=3.0):
    """
    Ukuran posisi futures berbasis risiko + cek buffer likuidasi.
    fee_rate: taker per sisi (default 0,06%); slippage_pct: perkiraan slippage per sisi.
    buffer_ratio: jarak stop maksimum = buffer_ratio * jarak entry->likuidasi.
    Return dict; ok=False bila melanggar guardrail (alasan di 'reasons').
    """
    if (side == "long" and stop >= entry) or (side == "short" and stop <= entry):
        raise ValueError("stop harus di sisi yang benar dari entry")
    stop_pct = abs(entry - stop) / entry
    # risiko efektif per unit notional: jarak stop + fee dua sisi + slippage dua sisi
    eff_loss_pct = stop_pct + 2 * fee_rate + 2 * slippage_pct
    risk_amt = equity * risk_pct
    notional = risk_amt / eff_loss_pct
    margin = notional / leverage
    liq = liquidation_price(entry, leverage, side, mmr)
    liq_dist = abs(entry - liq)
    stop_dist = abs(entry - stop)
    reasons = []
    if stop_dist > buffer_ratio * liq_dist:
        reasons.append("stop terlalu dekat ke harga likuidasi (buffer tidak cukup)")
    if margin > equity:
        reasons.append("margin melebihi ekuitas; turunkan notional/naikkan leverage dengan hati-hati")
    eff_lev = notional / equity
    if eff_lev > max_effective_leverage:
        reasons.append(f"leverage efektif {eff_lev:.2f}x melebihi batas {max_effective_leverage}x")
    return {
        "ok": not reasons, "reasons": reasons,
        "notional": notional, "qty": notional / entry, "margin": margin,
        "risk_amount": risk_amt, "liq_price": liq,
        "stop_pct": stop_pct, "liq_distance_pct": liq_dist / entry,
        "effective_leverage": eff_lev,
    }


# ---------- Binary option (analisis matematis saja) ----------
def binary_breakeven_winrate(payout):
    """Win rate impas. payout = untung per 1 taruhan saat menang (0.85 = 85%)."""
    return 1.0 / (1.0 + payout)


def binary_ev(win_rate, payout):
    """Expected value per 1 unit taruhan."""
    return win_rate * payout - (1.0 - win_rate)


def binary_kelly(win_rate, payout):
    """Fraksi Kelly; <=0 berarti tidak ada edge."""
    return win_rate - (1.0 - win_rate) / payout


def binary_ruin_streak(win_rate, n):
    """Peluang n kekalahan beruntun (ilustrasi bahaya martingale)."""
    return (1.0 - win_rate) ** n


if __name__ == "__main__":
    print("Liq long 10x :", round(liquidation_price(100_000, 10, "long"), 1))
    print("Liq short 25x:", round(liquidation_price(100_000, 25, "short"), 1))
    print("Funding/hari 0.01%/8j atas 10jt:", funding_cost(10_000_000, 0.0001, 3))
    print("Binary BE 85%:", round(binary_breakeven_winrate(0.85), 4))
    print("Binary EV W55% p85%:", round(binary_ev(0.55, 0.85), 4))
    print("Binary Kelly W55% p85%:", round(binary_kelly(0.55, 0.85), 4))
    print("Peluang 8 kalah beruntun W55%:", round(binary_ruin_streak(0.55, 8), 5))
    r = futures_position(equity=10_000, risk_pct=0.01, entry=100_000, stop=98_000, leverage=5)
    print("Futures:", {k: (round(v, 4) if isinstance(v, float) else v) for k, v in r.items()})
