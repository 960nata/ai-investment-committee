/**
 * Indikator teknikal — fungsi murni.
 *
 * Tidak ada satu pun yang lewat model bahasa. Inilah yang membuat seluruh sistem
 * bisa di-backtest: hasil hari ini harus persis sama dengan hasil yang dihitung
 * ulang tahun depan atas data yang sama.
 *
 * Dua aturan yang dipegang seluruh file ini:
 *
 * 1. Deret masuk urut menaik menurut tanggal, dan deret keluar selalu sepanjang
 *    deret masuk. Posisi yang belum punya cukup riwayat berisi `null`, bukan nol.
 *    Nol adalah angka; ketiadaan data bukan.
 * 2. Tidak ada nilai yang melihat ke depan. Nilai di indeks `i` hanya boleh
 *    dihitung dari indeks 0..i. Ini pencegah look-ahead bias yang paling murah,
 *    dan sumber kebohongan paling umum di backtest amatir.
 *
 * Deteksi pola candlestick sengaja tidak ada: bukti statistiknya lemah dan hanya
 * menambah derau ke dalam skor.
 */

export type Series = readonly number[]
export type MaybeSeries = (number | null)[]

export interface OhlcvSeries {
  date: readonly string[]
  open: Series
  high: Series
  low: Series
  close: Series
  volume: Series
  /**
   * Penutupan tersesuaikan aksi korporasi, bila sudah tersedia.
   *
   * Wajib dipakai untuk indikator apa pun. Saham yang stock split 1:2 terlihat
   * anjlok 50 persen kalau tidak disesuaikan, dan model akan membaca itu sebagai
   * sinyal negatif yang sangat kuat padahal tidak ada yang terjadi.
   */
  adjClose?: Series
}

function filled(length: number): MaybeSeries {
  return new Array<number | null>(length).fill(null)
}

// ---------------------------------------------------------------------------
// Tren
// ---------------------------------------------------------------------------

/** Rata-rata bergerak sederhana. */
export function sma(values: Series, period: number): MaybeSeries {
  const out = filled(values.length)
  if (period < 1) return out

  let sum = 0
  for (let i = 0; i < values.length; i++) {
    sum += values[i]
    if (i >= period) sum -= values[i - period]
    if (i >= period - 1) out[i] = sum / period
  }
  return out
}

/**
 * Rata-rata bergerak eksponensial.
 *
 * Disemai dengan SMA pada periode pertama, bukan dengan nilai tunggal. Penyemaian
 * satu nilai membuat puluhan nilai pertama bergantung pada satu hari acak.
 */
export function ema(values: Series, period: number): MaybeSeries {
  const out = filled(values.length)
  if (period < 1 || values.length < period) return out

  const multiplier = 2 / (period + 1)

  let seed = 0
  for (let i = 0; i < period; i++) seed += values[i]
  let previous = seed / period
  out[period - 1] = previous

  for (let i = period; i < values.length; i++) {
    previous = (values[i] - previous) * multiplier + previous
    out[i] = previous
  }
  return out
}

/**
 * Kemiringan rata-rata bergerak, dinyatakan sebagai persen perubahan per hari
 * selama `lookback` hari terakhir. Satuan relatif membuat saham mahal dan saham
 * murah bisa dibandingkan.
 */
export function slopePct(values: MaybeSeries, lookback: number): MaybeSeries {
  const out = filled(values.length)
  for (let i = lookback; i < values.length; i++) {
    const now = values[i]
    const then = values[i - lookback]
    if (now === null || then === null || then === 0) continue
    out[i] = ((now - then) / Math.abs(then) / lookback) * 100
  }
  return out
}

// ---------------------------------------------------------------------------
// Momentum
// ---------------------------------------------------------------------------

/**
 * Relative Strength Index, penghalusan Wilder.
 *
 * Nilainya harus selalu dibaca sebagai persentil terhadap riwayat saham itu
 * sendiri. RSI 70 pada aset tenang berarti hal yang sama sekali berbeda dengan
 * RSI 70 pada aset yang memang selalu bergerak keras.
 */
export function rsi(values: Series, period = 14): MaybeSeries {
  const out = filled(values.length)
  if (values.length <= period) return out

  let gainSum = 0
  let lossSum = 0
  for (let i = 1; i <= period; i++) {
    const change = values[i] - values[i - 1]
    if (change >= 0) gainSum += change
    else lossSum -= change
  }

  let avgGain = gainSum / period
  let avgLoss = lossSum / period
  out[period] = toRsi(avgGain, avgLoss)

  for (let i = period + 1; i < values.length; i++) {
    const change = values[i] - values[i - 1]
    const gain = change > 0 ? change : 0
    const loss = change < 0 ? -change : 0

    avgGain = (avgGain * (period - 1) + gain) / period
    avgLoss = (avgLoss * (period - 1) + loss) / period
    out[i] = toRsi(avgGain, avgLoss)
  }

  return out
}

function toRsi(avgGain: number, avgLoss: number): number {
  // Tanpa satu pun hari turun, RSI terdefinisi sebagai 100, bukan pembagian nol.
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100
  const rs = avgGain / avgLoss
  return 100 - 100 / (1 + rs)
}

export interface MacdResult {
  macd: MaybeSeries
  signal: MaybeSeries
  histogram: MaybeSeries
}

/** MACD klasik: EMA cepat dikurangi EMA lambat, plus garis sinyal. */
export function macd(values: Series, fast = 12, slow = 26, signalPeriod = 9): MacdResult {
  const fastEma = ema(values, fast)
  const slowEma = ema(values, slow)

  const line = filled(values.length)
  for (let i = 0; i < values.length; i++) {
    const f = fastEma[i]
    const s = slowEma[i]
    if (f !== null && s !== null) line[i] = f - s
  }

  // Garis sinyal adalah EMA dari garis MACD, jadi hanya dihitung setelah garis
  // MACD punya nilai — memulainya lebih awal berarti menghaluskan null.
  const firstDefined = line.findIndex((v) => v !== null)
  const signal = filled(values.length)

  if (firstDefined !== -1) {
    const dense = line.slice(firstDefined) as number[]
    const denseSignal = ema(dense, signalPeriod)
    for (let i = 0; i < denseSignal.length; i++) {
      signal[firstDefined + i] = denseSignal[i]
    }
  }

  const histogram = filled(values.length)
  for (let i = 0; i < values.length; i++) {
    const m = line[i]
    const s = signal[i]
    if (m !== null && s !== null) histogram[i] = m - s
  }

  return { macd: line, signal, histogram }
}

/** Rate of change, dalam persen terhadap `period` hari lalu. */
export function roc(values: Series, period: number): MaybeSeries {
  const out = filled(values.length)
  for (let i = period; i < values.length; i++) {
    const then = values[i - period]
    if (then === 0) continue
    out[i] = ((values[i] - then) / then) * 100
  }
  return out
}

// ---------------------------------------------------------------------------
// Volatilitas
// ---------------------------------------------------------------------------

/** Rentang sebenarnya, memperhitungkan gap dari penutupan sebelumnya. */
export function trueRange(high: Series, low: Series, close: Series): MaybeSeries {
  const out = filled(close.length)
  for (let i = 1; i < close.length; i++) {
    out[i] = Math.max(
      high[i] - low[i],
      Math.abs(high[i] - close[i - 1]),
      Math.abs(low[i] - close[i - 1]),
    )
  }
  return out
}

/** Average True Range, penghalusan Wilder. Dipakai untuk ukuran risiko dan stop. */
export function atr(high: Series, low: Series, close: Series, period = 14): MaybeSeries {
  const tr = trueRange(high, low, close)
  const out = filled(close.length)
  if (close.length <= period) return out

  let sum = 0
  for (let i = 1; i <= period; i++) sum += tr[i] ?? 0
  let previous = sum / period
  out[period] = previous

  for (let i = period + 1; i < close.length; i++) {
    previous = (previous * (period - 1) + (tr[i] ?? 0)) / period
    out[i] = previous
  }
  return out
}

/** ATR sebagai persen harga, supaya bisa dibandingkan antar-instrumen. */
export function atrPct(atrValues: MaybeSeries, close: Series): MaybeSeries {
  const out = filled(close.length)
  for (let i = 0; i < close.length; i++) {
    const a = atrValues[i]
    if (a !== null && close[i] !== 0) out[i] = (a / close[i]) * 100
  }
  return out
}

export interface BollingerResult {
  upper: MaybeSeries
  middle: MaybeSeries
  lower: MaybeSeries
  /** Lebar pita sebagai persen dari pita tengah. */
  widthPct: MaybeSeries
  /** Posisi harga di dalam pita: 0 di pita bawah, 1 di pita atas. */
  percentB: MaybeSeries
}

export function bollinger(values: Series, period = 20, stdDevs = 2): BollingerResult {
  const middle = sma(values, period)
  const upper = filled(values.length)
  const lower = filled(values.length)
  const widthPct = filled(values.length)
  const percentB = filled(values.length)

  for (let i = period - 1; i < values.length; i++) {
    const mean = middle[i]
    if (mean === null) continue

    let variance = 0
    for (let j = i - period + 1; j <= i; j++) {
      variance += (values[j] - mean) ** 2
    }
    const sd = Math.sqrt(variance / period)

    upper[i] = mean + stdDevs * sd
    lower[i] = mean - stdDevs * sd
    if (mean !== 0) widthPct[i] = ((2 * stdDevs * sd) / mean) * 100
    if (sd > 0) percentB[i] = (values[i] - lower[i]!) / (upper[i]! - lower[i]!)
  }

  return { upper, middle, lower, widthPct, percentB }
}

/**
 * Imbal hasil sederhana. Dipakai saat nilainya dijumlah antar-aset, misalnya
 * imbal hasil portofolio, dan sebagai target model klasifikasi karena itulah
 * yang dipahami pembaca sebagai "naik berapa persen".
 */
export function dailyReturns(values: Series): MaybeSeries {
  const out = filled(values.length)
  for (let i = 1; i < values.length; i++) {
    if (values[i - 1] <= 0) continue
    out[i] = (values[i] - values[i - 1]) / values[i - 1]
  }
  return out
}

/**
 * Imbal hasil logaritmik. Dipakai saat nilainya dijumlah antar-waktu.
 *
 * Sifat aditifnya yang membuatnya benar untuk volatilitas: ln(P1/P0) + ln(P2/P1)
 * sama persis dengan ln(P2/P0), sementara penjumlahan imbal hasil sederhana
 * tidak. Salah memilih di sini tidak membuat program gagal, hanya membuat
 * angkanya meleset sedikit, terus-menerus, tanpa ada yang menyadarinya.
 */
export function logReturns(values: Series): MaybeSeries {
  const out = filled(values.length)
  for (let i = 1; i < values.length; i++) {
    if (values[i - 1] <= 0 || values[i] <= 0) continue
    out[i] = Math.log(values[i] / values[i - 1])
  }
  return out
}

/**
 * Volatilitas terealisasi, disetahunkan memakai 365 hari.
 *
 * Crypto diperdagangkan setiap hari, sementara bursa saham hanya sekitar 252
 * hari setahun. Pemanggil memberi `periodsPerYear` yang sesuai pasarnya; memakai
 * satu angka untuk keduanya membuat volatilitas saham tampak lebih besar sekitar
 * dua puluh persen daripada yang sebenarnya.
 */
export function realizedVolatility(
  values: Series,
  period = 20,
  periodsPerYear = 365,
): MaybeSeries {
  const returns = logReturns(values)
  const out = filled(values.length)

  for (let i = period; i < values.length; i++) {
    const window: number[] = []
    for (let j = i - period + 1; j <= i; j++) {
      const r = returns[j]
      if (r !== null) window.push(r)
    }
    if (window.length < period) continue

    const mean = window.reduce((a, b) => a + b, 0) / window.length
    const variance =
      window.reduce((acc, r) => acc + (r - mean) ** 2, 0) / (window.length - 1)
    out[i] = Math.sqrt(variance) * Math.sqrt(periodsPerYear)
  }

  return out
}

/** Penurunan terdalam dari puncak tertinggi sejauh ini, sebagai pecahan negatif. */
export function maxDrawdown(values: Series): number | null {
  if (values.length === 0) return null

  let peak = values[0]
  let worst = 0

  for (const value of values) {
    if (value > peak) peak = value
    if (peak > 0) {
      const drawdown = (value - peak) / peak
      if (drawdown < worst) worst = drawdown
    }
  }

  return worst
}

// ---------------------------------------------------------------------------
// Volume
// ---------------------------------------------------------------------------

/** Volume hari ini dibagi rata-rata `period` hari. Satu berarti biasa saja. */
export function relativeVolume(volume: Series, period = 20): MaybeSeries {
  const average = sma(volume, period)
  const out = filled(volume.length)
  for (let i = 0; i < volume.length; i++) {
    const avg = average[i]
    if (avg !== null && avg > 0) out[i] = volume[i] / avg
  }
  return out
}

/** On-Balance Volume: volume kumulatif bertanda arah harga. */
export function obv(close: Series, volume: Series): MaybeSeries {
  const out = filled(close.length)
  if (close.length === 0) return out

  let total = 0
  out[0] = 0
  for (let i = 1; i < close.length; i++) {
    if (close[i] > close[i - 1]) total += volume[i]
    else if (close[i] < close[i - 1]) total -= volume[i]
    out[i] = total
  }
  return out
}

/**
 * Simpangan harga terhadap VWAP bergulir.
 *
 * VWAP yang sebenarnya butuh data intraday, yang tidak disimpan sistem ini.
 * Yang dihitung di sini adalah pendekatannya dari candle harian memakai harga
 * tipikal (H+L+C)/3. Namanya sengaja tetap disebut pendekatan, supaya tidak ada
 * yang menyangka ini VWAP eksekusi.
 */
export function vwapDeviationPct(
  high: Series,
  low: Series,
  close: Series,
  volume: Series,
  period = 20,
): MaybeSeries {
  const out = filled(close.length)

  for (let i = period - 1; i < close.length; i++) {
    let weighted = 0
    let totalVolume = 0
    for (let j = i - period + 1; j <= i; j++) {
      const typical = (high[j] + low[j] + close[j]) / 3
      weighted += typical * volume[j]
      totalVolume += volume[j]
    }
    if (totalVolume <= 0) continue

    const vwap = weighted / totalVolume
    if (vwap !== 0) out[i] = ((close[i] - vwap) / vwap) * 100
  }

  return out
}

// ---------------------------------------------------------------------------
// Struktur harga
// ---------------------------------------------------------------------------

export interface RangePosition {
  /** Jarak ke tertinggi periode, dalam persen. Nol berarti sedang di puncak. */
  distanceFromHighPct: MaybeSeries
  /** Jarak dari terendah periode, dalam persen. */
  distanceFromLowPct: MaybeSeries
  /** Posisi 0..1 di dalam rentang; 1 berarti di tertinggi periode. */
  positionInRange: MaybeSeries
}

/** Posisi harga dalam rentangnya sendiri, bawaan 252 hari perdagangan. */
export function rangePosition(
  high: Series,
  low: Series,
  close: Series,
  period = 252,
): RangePosition {
  const distanceFromHighPct = filled(close.length)
  const distanceFromLowPct = filled(close.length)
  const positionInRange = filled(close.length)

  for (let i = 0; i < close.length; i++) {
    const start = Math.max(0, i - period + 1)
    // Rentang penuh belum terbentuk di awal deret; melaporkannya akan membuat
    // instrumen yang baru tercatat terlihat seperti menyentuh tertinggi setahun.
    if (i - start + 1 < Math.min(period, 60)) continue

    let highest = -Infinity
    let lowest = Infinity
    for (let j = start; j <= i; j++) {
      if (high[j] > highest) highest = high[j]
      if (low[j] < lowest) lowest = low[j]
    }

    if (highest > 0) distanceFromHighPct[i] = ((close[i] - highest) / highest) * 100
    if (lowest > 0) distanceFromLowPct[i] = ((close[i] - lowest) / lowest) * 100
    if (highest > lowest) positionInRange[i] = (close[i] - lowest) / (highest - lowest)
  }

  return { distanceFromHighPct, distanceFromLowPct, positionInRange }
}

export interface PivotLevels {
  pivot: MaybeSeries
  resistance1: MaybeSeries
  support1: MaybeSeries
  /** Posisi harga antara S1 dan R1; di bawah nol berarti menembus support. */
  positionBetweenLevels: MaybeSeries
}

/**
 * Titik pivot klasik dari candle sebelumnya.
 *
 * Dihitung dari hari sebelumnya, tidak pernah dari hari berjalan — level yang
 * memakai penutupan hari ini untuk menilai harga hari ini tidak berarti apa-apa.
 */
export function pivotLevels(high: Series, low: Series, close: Series): PivotLevels {
  const pivot = filled(close.length)
  const resistance1 = filled(close.length)
  const support1 = filled(close.length)
  const positionBetweenLevels = filled(close.length)

  for (let i = 1; i < close.length; i++) {
    const p = (high[i - 1] + low[i - 1] + close[i - 1]) / 3
    const r1 = 2 * p - low[i - 1]
    const s1 = 2 * p - high[i - 1]

    pivot[i] = p
    resistance1[i] = r1
    support1[i] = s1
    if (r1 !== s1) positionBetweenLevels[i] = (close[i] - s1) / (r1 - s1)
  }

  return { pivot, resistance1, support1, positionBetweenLevels }
}

// ---------------------------------------------------------------------------
// Kekuatan relatif
// ---------------------------------------------------------------------------

/**
 * Kekuatan relatif terhadap tolok ukur, dalam poin persen.
 *
 * Positif berarti instrumen ini unggul dari tolok ukurnya selama periode itu.
 * Deret tolok ukur wajib sudah disejajarkan menurut tanggal oleh pemanggil;
 * menyejajarkannya di sini akan menyembunyikan tanggal yang tidak cocok.
 */
export function relativeStrength(
  values: Series,
  benchmark: MaybeSeries,
  period: number,
): MaybeSeries {
  const out = filled(values.length)

  for (let i = period; i < values.length; i++) {
    const ownThen = values[i - period]
    const benchNow = benchmark[i]
    const benchThen = benchmark[i - period]

    if (ownThen === 0 || benchNow === null || benchThen === null || benchThen === 0) continue

    const ownReturn = ((values[i] - ownThen) / ownThen) * 100
    const benchReturn = ((benchNow - benchThen) / benchThen) * 100
    out[i] = ownReturn - benchReturn
  }

  return out
}

// ---------------------------------------------------------------------------
// Normalisasi
// ---------------------------------------------------------------------------

/**
 * Peringkat persentil sebuah nilai terhadap riwayatnya sendiri, 0..1.
 *
 * Hanya melihat ke belakang: persentil di indeks `i` dihitung dari jendela yang
 * berakhir di `i`. Memakai seluruh deret, termasuk masa depan, akan membuat
 * backtest tampak jauh lebih pintar daripada kenyataannya.
 */
export function rollingPercentile(values: MaybeSeries, window: number): MaybeSeries {
  const out = filled(values.length)
  const minimumSample = Math.min(window, 60)

  for (let i = 0; i < values.length; i++) {
    const current = values[i]
    if (current === null) continue

    const start = Math.max(0, i - window + 1)
    let belowOrEqual = 0
    let counted = 0

    for (let j = start; j <= i; j++) {
      const past = values[j]
      if (past === null) continue
      counted++
      if (past <= current) belowOrEqual++
    }

    if (counted >= minimumSample) out[i] = belowOrEqual / counted
  }

  return out
}

// ---------------------------------------------------------------------------
// Kekuatan tren — ADX
// ---------------------------------------------------------------------------

/**
 * Penghalusan Wilder bentuk rata-rata.
 *
 * Wilder memakai faktor 1/n, bukan 2/(n+1) seperti EMA biasa. Keduanya sering
 * tertukar, dan hasilnya berbeda cukup jauh untuk membuat indikator yang sama
 * tidak cocok dengan platform mana pun.
 */
function wilderSmooth(values: MaybeSeries, period: number, startIndex: number): MaybeSeries {
  const out = filled(values.length)
  if (values.length < startIndex + period) return out

  let sum = 0
  for (let i = startIndex; i < startIndex + period; i++) sum += values[i] ?? 0

  let previous = sum / period
  out[startIndex + period - 1] = previous

  for (let i = startIndex + period; i < values.length; i++) {
    previous = (previous * (period - 1) + (values[i] ?? 0)) / period
    out[i] = previous
  }
  return out
}

export interface AdxResult {
  plusDi: MaybeSeries
  minusDi: MaybeSeries
  adx: MaybeSeries
}

/**
 * Average Directional Index beserta kedua indikator arahnya.
 *
 * ADX dipakai sebagai pengubah bobot, bukan sebagai sinyal arah. Di bawah dua
 * puluh, pasar sedang menyamping dan bobot fitur tren diturunkan; di atas dua
 * puluh lima, tren itu nyata dan bobotnya dinaikkan. Nilainya sendiri tidak
 * pernah memberi tahu ke arah mana harga bergerak.
 */
export function adx(high: Series, low: Series, close: Series, period = 14): AdxResult {
  const length = close.length
  const tr = trueRange(high, low, close)
  const plusDm = filled(length)
  const minusDm = filled(length)

  for (let i = 1; i < length; i++) {
    const up = high[i] - high[i - 1]
    const down = low[i - 1] - low[i]
    plusDm[i] = up > down && up > 0 ? up : 0
    minusDm[i] = down > up && down > 0 ? down : 0
  }

  // Pembilang dan penyebut memakai bentuk penghalusan yang sama, sehingga
  // rasionya tidak bergantung pada pilihan bentuk jumlah atau rata-rata.
  const smoothTr = wilderSmooth(tr, period, 1)
  const smoothPlus = wilderSmooth(plusDm, period, 1)
  const smoothMinus = wilderSmooth(minusDm, period, 1)

  const plusDi = filled(length)
  const minusDi = filled(length)
  const dx = filled(length)

  for (let i = 0; i < length; i++) {
    const trValue = smoothTr[i]
    if (trValue === null || trValue === 0) continue

    const p = (100 * (smoothPlus[i] ?? 0)) / trValue
    const m = (100 * (smoothMinus[i] ?? 0)) / trValue
    plusDi[i] = p
    minusDi[i] = m

    const total = p + m
    // Kedua arah nol berarti tidak ada gerakan berarah sama sekali, bukan
    // tren sempurna. DX nol adalah jawaban yang benar, bukan pembagian nol.
    dx[i] = total === 0 ? 0 : (100 * Math.abs(p - m)) / total
  }

  const firstDx = dx.findIndex((v) => v !== null)
  const adxSeries = firstDx === -1 ? filled(length) : wilderSmooth(dx, period, firstDx)

  return { plusDi, minusDi, adx: adxSeries }
}

// ---------------------------------------------------------------------------
// Momentum jangka menengah
// ---------------------------------------------------------------------------

/**
 * Momentum dua belas bulan dikurangi satu bulan terakhir.
 *
 * Versi yang paling konsisten bertahan dalam literatur. Bulan terakhir sengaja
 * dilewatkan karena ada efek pembalikan jangka sangat pendek yang justru
 * mengacaukan sinyal momentum bila ikut dihitung.
 */
export function momentum12m1m(values: Series, skip = 21, lookback = 252): MaybeSeries {
  const out = filled(values.length)
  for (let i = lookback; i < values.length; i++) {
    const recent = values[i - skip]
    const base = values[i - lookback]
    if (base <= 0) continue
    out[i] = recent / base - 1
  }
  return out
}

/**
 * Rasio volatilitas jangka pendek terhadap jangka menengah.
 *
 * Di atas 1,5 berarti pasar sedang gelisah pada instrumen itu. Dipakai untuk
 * menurunkan confidence, tidak pernah sebagai penentu arah.
 */
export function volatilityRatio(
  values: Series,
  shortPeriod = 20,
  longPeriod = 120,
  periodsPerYear = 365,
): MaybeSeries {
  const shortVol = realizedVolatility(values, shortPeriod, periodsPerYear)
  const longVol = realizedVolatility(values, longPeriod, periodsPerYear)

  const out = filled(values.length)
  for (let i = 0; i < values.length; i++) {
    const s = shortVol[i]
    const l = longVol[i]
    if (s === null || l === null || l <= 0) continue
    out[i] = s / l
  }
  return out
}

// ---------------------------------------------------------------------------
// Akumulasi dan distribusi
// ---------------------------------------------------------------------------

/**
 * Money flow multiplier: di mana penutupan berada di dalam rentang hari itu.
 *
 * Mendekati +1 berarti harga ditutup di dekat tertinggi hari itu, yang berarti
 * pembeli menguasai sampai lonceng penutupan.
 */
export function moneyFlowMultiplier(high: Series, low: Series, close: Series): MaybeSeries {
  const out = filled(close.length)
  for (let i = 0; i < close.length; i++) {
    const range = high[i] - low[i]
    // Hari tanpa rentang sama sekali tidak memberi informasi tentang siapa yang
    // menguasai; nol di sini berarti netral, dan itu memang benar.
    out[i] = range === 0 ? 0 : (close[i] - low[i] - (high[i] - close[i])) / range
  }
  return out
}

/** Garis akumulasi–distribusi: money flow multiplier dikalikan volume, kumulatif. */
export function accumulationDistribution(
  high: Series,
  low: Series,
  close: Series,
  volume: Series,
): MaybeSeries {
  const mfm = moneyFlowMultiplier(high, low, close)
  const out = filled(close.length)

  let total = 0
  for (let i = 0; i < close.length; i++) {
    total += (mfm[i] ?? 0) * volume[i]
    out[i] = total
  }
  return out
}

// ---------------------------------------------------------------------------
// Statistik tahan pencilan
// ---------------------------------------------------------------------------

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]
}

/** Median absolute deviation, ukuran sebaran yang tidak dirusak satu pencilan. */
export function medianAbsoluteDeviation(values: readonly number[]): number | null {
  const centre = median(values)
  if (centre === null) return null
  return median(values.map((v) => Math.abs(v - centre)))
}

/** Konstanta yang menyetarakan MAD dengan simpangan baku pada data normal. */
export const MAD_TO_SIGMA = 1.4826

/** Batas pemangkasan z-score. Satu pencilan ekstrem tidak boleh mendominasi skor. */
export const Z_CLIP = 3

/**
 * Robust z-score satu nilai terhadap satu populasi.
 *
 * Memakai median dan MAD, bukan rata-rata dan simpangan baku, karena data
 * keuangan penuh pencilan yang merusak keduanya. Satu emiten dengan PER empat
 * ribu, karena labanya nyaris nol, sudah cukup untuk menggeser rata-rata seluruh
 * sektornya.
 */
export function robustZ(value: number, population: readonly number[]): number | null {
  const centre = median(population)
  const spread = medianAbsoluteDeviation(population)
  if (centre === null || spread === null) return null

  // Sebaran nol berarti mayoritas populasi bernilai sama persis. Nilai yang ikut
  // sama dengan median memang netral, tetapi nilai yang menyimpang justru
  // seekstrem mungkin: tidak ada satu pun pembanding yang menyerupainya.
  // Mengembalikan nol untuk kasus kedua akan menyembunyikan pencilan terbesar.
  if (spread === 0) {
    if (value === centre) return 0
    return value > centre ? Z_CLIP : -Z_CLIP
  }

  const z = (value - centre) / (MAD_TO_SIGMA * spread)
  return Math.max(-Z_CLIP, Math.min(Z_CLIP, z))
}

/**
 * Robust z-score bergulir terhadap riwayat instrumen itu sendiri.
 *
 * Menjawab pertanyaan "apakah instrumen ini sedang tidak biasa bagi dirinya
 * sendiri", yang berbeda dari "apakah ia menonjol dibanding instrumen lain".
 * Keduanya dihitung dan disimpan terpisah.
 */
export function rollingRobustZ(values: MaybeSeries, window: number): MaybeSeries {
  const out = filled(values.length)
  const minimumSample = Math.min(window, 60)

  for (let i = 0; i < values.length; i++) {
    const current = values[i]
    if (current === null) continue

    const start = Math.max(0, i - window + 1)
    const population: number[] = []
    for (let j = start; j <= i; j++) {
      const past = values[j]
      if (past !== null) population.push(past)
    }

    if (population.length < minimumSample) continue
    out[i] = robustZ(current, population)
  }

  return out
}

/**
 * Winsorisasi: pangkas nilai ekstrem ke persentil batas, jangan dibuang.
 *
 * Membuang pencilan juga salah. Emiten dengan rasio aneh tetap ada, tetap
 * tercatat, dan tetap bisa dibeli orang; yang perlu dibatasi hanya pengaruhnya
 * terhadap statistik populasi.
 */
export function winsorize(
  values: readonly number[],
  lowerPercentile = 0.01,
  upperPercentile = 0.99,
): number[] {
  if (values.length === 0) return []

  const sorted = [...values].sort((a, b) => a - b)
  const at = (p: number) => {
    const index = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))))
    return sorted[index]
  }

  const low = at(lowerPercentile)
  const high = at(upperPercentile)
  return values.map((v) => Math.min(high, Math.max(low, v)))
}
