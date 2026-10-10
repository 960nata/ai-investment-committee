"""
trading_toolkit.py — modul referensi deterministik untuk AI agent trading.

Prinsip: SEMUA angka (indikator, ukuran posisi, metrik) dihitung di sini,
BUKAN oleh LLM. LLM hanya menafsirkan hasil. Hanya butuh numpy.

Konvensi: input berupa np.ndarray urut waktu lama -> baru. Output sejajar
panjang input; nilai awal yang belum cukup data = np.nan.
Semua indikator hanya memakai data sampai bar ke-i (tanpa look-ahead).
"""
from __future__ import annotations
import numpy as np


# ---------- Moving average ----------
def sma(x, n):
    x = np.asarray(x, float)
    out = np.full_like(x, np.nan)
    if len(x) >= n:
        c = np.cumsum(np.insert(x, 0, 0.0))
        out[n - 1:] = (c[n:] - c[:-n]) / n
    return out


def ema(x, n):
    """EMA dengan alpha = 2/(n+1), di-seed dengan SMA n bar pertama."""
    x = np.asarray(x, float)
    out = np.full_like(x, np.nan)
    if len(x) < n:
        return out
    a = 2.0 / (n + 1)
    out[n - 1] = x[:n].mean()
    for i in range(n, len(x)):
        out[i] = a * x[i] + (1 - a) * out[i - 1]
    return out


def wilder(x, n):
    """Smoothing Wilder (RMA): alpha = 1/n, seed = rata-rata n bar pertama."""
    x = np.asarray(x, float)
    out = np.full_like(x, np.nan)
    if len(x) < n:
        return out
    out[n - 1] = x[:n].mean()
    for i in range(n, len(x)):
        out[i] = (out[i - 1] * (n - 1) + x[i]) / n
    return out


# ---------- Momentum ----------
def rsi(close, n=14):
    c = np.asarray(close, float)
    d = np.diff(c, prepend=np.nan)
    gain = np.where(d > 0, d, 0.0)
    loss = np.where(d < 0, -d, 0.0)
    gain[0] = loss[0] = 0.0
    # seed memakai n perubahan pertama (indeks 1..n)
    ag = np.full_like(c, np.nan)
    al = np.full_like(c, np.nan)
    if len(c) <= n:
        return ag
    ag[n] = gain[1:n + 1].mean()
    al[n] = loss[1:n + 1].mean()
    for i in range(n + 1, len(c)):
        ag[i] = (ag[i - 1] * (n - 1) + gain[i]) / n
        al[i] = (al[i - 1] * (n - 1) + loss[i]) / n
    with np.errstate(divide="ignore", invalid="ignore"):
        rs = ag / al
        out = 100.0 - 100.0 / (1.0 + rs)
    out = np.where(al == 0, 100.0, out)       # tanpa loss -> RSI 100
    out[:n] = np.nan
    return out


def macd(close, fast=12, slow=26, signal=9):
    c = np.asarray(close, float)
    line = ema(c, fast) - ema(c, slow)
    valid = ~np.isnan(line)
    sig = np.full_like(c, np.nan)
    if valid.sum() >= signal:
        idx = np.where(valid)[0][0]
        sig[idx:] = ema(line[idx:], signal)
    return line, sig, line - sig


def stochastic(high, low, close, k=14, d=3, smooth=3):
    h, l, c = (np.asarray(v, float) for v in (high, low, close))
    n = len(c)
    raw = np.full(n, np.nan)
    for i in range(k - 1, n):
        hh, ll = h[i - k + 1:i + 1].max(), l[i - k + 1:i + 1].min()
        raw[i] = 50.0 if hh == ll else 100.0 * (c[i] - ll) / (hh - ll)
    k_s = sma(np.nan_to_num(raw, nan=0.0), smooth)
    k_s[: k - 1 + smooth - 1] = np.nan
    d_s = sma(np.nan_to_num(k_s, nan=0.0), d)
    d_s[: k - 1 + smooth + d - 2] = np.nan
    return k_s, d_s


# ---------- Volatilitas ----------
def true_range(high, low, close):
    h, l, c = (np.asarray(v, float) for v in (high, low, close))
    pc = np.roll(c, 1)
    tr = np.maximum.reduce([h - l, np.abs(h - pc), np.abs(l - pc)])
    tr[0] = h[0] - l[0]
    return tr


def atr(high, low, close, n=14):
    return wilder(true_range(high, low, close), n)


def bollinger(close, n=20, k=2.0):
    """Return (mid, upper, lower, pct_b, bandwidth). std = populasi (ddof=0)."""
    c = np.asarray(close, float)
    mid = sma(c, n)
    sd = np.full_like(c, np.nan)
    for i in range(n - 1, len(c)):
        sd[i] = c[i - n + 1:i + 1].std()
    up, lo = mid + k * sd, mid - k * sd
    with np.errstate(divide="ignore", invalid="ignore"):
        pb = (c - lo) / (up - lo)
        bw = (up - lo) / mid
    return mid, up, lo, pb, bw


def keltner(high, low, close, n=20, mult=2.0, atr_n=10):
    mid = ema(close, n)
    a = atr(high, low, close, atr_n)
    return mid, mid + mult * a, mid - mult * a


def donchian(high, low, n=20):
    h, l = np.asarray(high, float), np.asarray(low, float)
    up = np.full_like(h, np.nan)
    lo = np.full_like(h, np.nan)
    for i in range(n - 1, len(h)):
        up[i] = h[i - n + 1:i + 1].max()
        lo[i] = l[i - n + 1:i + 1].min()
    return up, (up + lo) / 2, lo


# ---------- Tren ----------
def adx(high, low, close, n=14):
    """Return (adx, +DI, -DI). >25 umumnya tren kuat, <20 cenderung sideways."""
    h, l, c = (np.asarray(v, float) for v in (high, low, close))
    up, dn = np.diff(h, prepend=h[0]), -np.diff(l, prepend=l[0])
    pdm = np.where((up > dn) & (up > 0), up, 0.0)
    mdm = np.where((dn > up) & (dn > 0), dn, 0.0)
    pdm[0] = mdm[0] = 0.0
    trs = wilder(true_range(h, l, c), n)
    with np.errstate(divide="ignore", invalid="ignore"):
        pdi = 100 * wilder(pdm, n) / trs
        mdi = 100 * wilder(mdm, n) / trs
        dx = 100 * np.abs(pdi - mdi) / (pdi + mdi)
    out = np.full_like(c, np.nan)
    valid = np.where(~np.isnan(dx))[0]
    if len(valid) >= n:
        s = valid[0]
        out[s:] = wilder(np.nan_to_num(dx[s:]), n)
    return out, pdi, mdi


# ---------- Volume ----------
def obv(close, volume):
    c, v = np.asarray(close, float), np.asarray(volume, float)
    s = np.sign(np.diff(c, prepend=c[0]))
    return np.cumsum(s * v)


def vwap(high, low, close, volume):
    """VWAP kumulatif sejak awal array (reset per sesi = potong array per hari)."""
    tp = (np.asarray(high, float) + np.asarray(low, float) + np.asarray(close, float)) / 3
    v = np.asarray(volume, float)
    return np.cumsum(tp * v) / np.cumsum(v)


def relative_volume(volume, n=20):
    v = np.asarray(volume, float)
    avg = sma(v, n)
    prev_avg = np.roll(avg, 1)  # bandingkan dengan rata-rata SEBELUM bar ini
    prev_avg[0] = np.nan
    return v / prev_avg


# ---------- Risk & sizing ----------
def position_size(equity, risk_pct, entry, stop, lot=1, max_pos_pct=None):
    """
    Ukuran posisi berbasis risiko tetap.
    equity: modal; risk_pct: mis. 0.01 = 1%; lot: 100 untuk saham IDX.
    max_pos_pct: batas nilai posisi terhadap equity (mis. 0.2).
    Return dict(qty, risk_amount, notional, r_per_unit).
    """
    r_unit = abs(entry - stop)
    if r_unit <= 0:
        raise ValueError("entry dan stop tidak boleh sama")
    risk_amt = equity * risk_pct
    qty = risk_amt / r_unit
    if max_pos_pct is not None:
        qty = min(qty, equity * max_pos_pct / entry)
    qty = int(qty // lot) * lot
    return {"qty": qty, "risk_amount": qty * r_unit,
            "notional": qty * entry, "r_per_unit": r_unit}


def atr_stop(entry, atr_value, mult=2.0, side="long"):
    return entry - mult * atr_value if side == "long" else entry + mult * atr_value


def kelly_fraction(win_rate, payoff_ratio):
    """f* = W - (1-W)/R. Bisa negatif (= tidak ada edge -> jangan trade)."""
    return win_rate - (1.0 - win_rate) / payoff_ratio


def expectancy_r(win_rate, avg_win_r, avg_loss_r=1.0):
    """Ekspektasi per trade dalam satuan R (risiko awal)."""
    return win_rate * avg_win_r - (1 - win_rate) * avg_loss_r


def max_drawdown(equity_curve):
    e = np.asarray(equity_curve, float)
    peak = np.maximum.accumulate(e)
    dd = e / peak - 1.0
    return dd.min()


def sharpe(returns, periods_per_year=252, rf=0.0):
    r = np.asarray(returns, float) - rf / periods_per_year
    sd = r.std(ddof=1)
    return np.nan if sd == 0 else r.mean() / sd * np.sqrt(periods_per_year)


def profit_factor(trade_pnls):
    p = np.asarray(trade_pnls, float)
    gross_win, gross_loss = p[p > 0].sum(), -p[p < 0].sum()
    return np.inf if gross_loss == 0 else gross_win / gross_loss


# ---------- IDX helper (aturan BEI per 28 Sep 2026; verifikasi ulang berkala) ----------
def idx_auto_rejection(prev_close, today="transition"):
    """
    Batas ARA/ARB harga (persen), mengikuti tabel BEI.
    today: 'transition' (28 Sep-31 Des 2026: ARB 15% simetris belum berlaku)
           atau 'full' (mulai 1 Jan 2027: ARB simetris dengan ARA).
    Harga Rp1-10: ARA/ARB = Rp1 (bukan persen).
    """
    p = prev_close
    if p <= 10:
        return {"ara": p + 1, "arb": max(p - 1, 1), "mode": "rupiah"}
    if p <= 200:
        ara_pct, arb_full = 0.35, 0.35
    elif p <= 5000:
        ara_pct, arb_full = 0.25, 0.25
    else:
        ara_pct, arb_full = 0.20, 0.20
    arb_pct = 0.15 if today == "transition" else arb_full
    return {"ara": p * (1 + ara_pct), "arb": p * (1 - arb_pct), "mode": "percent",
            "ara_pct": ara_pct, "arb_pct": arb_pct}
    # CATATAN: pembulatan ke fraksi harga (tick size) belum dilakukan di sini.


if __name__ == "__main__":
    # Smoke test dengan data sintetis — jalankan: python trading_toolkit.py
    rng = np.random.default_rng(7)
    close = 100 + np.cumsum(rng.normal(0.1, 1.0, 300))
    high, low = close + rng.uniform(0.2, 1.0, 300), close - rng.uniform(0.2, 1.0, 300)
    vol = rng.integers(1_000, 5_000, 300).astype(float)
    print("RSI14      :", round(rsi(close)[-1], 2))
    m, s, h = macd(close)
    print("MACD/sig/h :", round(m[-1], 3), round(s[-1], 3), round(h[-1], 3))
    mid, up, lo, pb, bw = bollinger(close)
    print("BB %B / bw :", round(pb[-1], 3), round(bw[-1], 4))
    print("ATR14      :", round(atr(high, low, close)[-1], 3))
    print("ADX14      :", round(adx(high, low, close)[0][-1], 2))
    print("Kelly 55%/2:", kelly_fraction(0.55, 2.0))
    print("Sizing IDX :", position_size(100_000_000, 0.01, 5000, 4750, lot=100, max_pos_pct=0.2))
    print("ARA/ARB    :", idx_auto_rejection(150))
