'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  IconGauge,
  IconScales,
  IconCandles,
  IconTarget,
  IconShield,
  IconArrowRight,
  IconTrendUp,
  IconTrendDown,
} from '@/components/icons'
import { AssetIcon } from '@/components/asset-icons'
import type { InstrumentQuote } from '@/lib/db/queries'

interface DeliberationSample {
  symbol: string
  name: string
  assetClass: string
  price: string
  change: string
  isUp: boolean
  verdict: 'BELI' | 'TAHAN' | 'JUAL' | 'ABSTAIN'
  confidence: number
  verdictStatus: string
  bullWeight: number
  bearWeight: number
  analyst: {
    stat1: string
    stat2: string
    stat3: string
    summary: string
  }
  strategist: {
    thesis: string
    horizon: string
    target: string
  }
  riskGuardian: {
    vetoActive: boolean
    objection: string
    stopLoss: string
  }
  chairman: {
    ruling: string
    condition: string
  }
}

const SAMPLES: Record<string, DeliberationSample> = {
  BTCUSDT: {
    symbol: 'BTCUSDT',
    name: 'Bitcoin',
    assetClass: 'Kripto',
    price: '$63.840,00',
    change: '+2,45%',
    isUp: true,
    verdict: 'ABSTAIN',
    confidence: 25,
    verdictStatus: 'Deadlock · Pengawas Risiko Memblokir Tesis',
    bullWeight: 45,
    bearWeight: 55,
    analyst: {
      stat1: 'Rasio Volume 20v100: 0,82x (Pelemahan Partisipasi)',
      stat2: 'Jarak Harga ke SMA50: +9,95% (Overbought Jangka Pendek)',
      stat3: 'Jarak ke SMA200: +18,4% · Drawdown 90H: -14,2%',
      summary: 'Data 401 candle menunjukkan tren naik jangka menengah, namun momentum harian melemah di bawah rata-rata volume.',
    },
    strategist: {
      thesis: 'Bitcoin dalam fase pemulihan struktural. Potensi reli lanjutan menuju resistensi psikologis jika bertahan di atas SMA20.',
      horizon: '2 - 4 Minggu (Posisi Sedang)',
      target: '+15,8% menuju retest level puncak lokal',
    },
    riskGuardian: {
      vetoActive: true,
      objection: 'Ruang koreksi ke SMA200 sebesar -12,4% melebihi toleransi risiko. Volume beli tidak mencukupi untuk memvalidasi breakout.',
      stopLoss: 'Tutup posisi jika penutupan harian di bawah SMA20 ($61.200)',
    },
    chairman: {
      ruling: 'Komite memutuskan ABSTAIN. Keberatan risiko belum terjawab oleh strateg. Menolak alokasi modal tanpa konfirmasi volume 1,0x.',
      condition: 'Pembatalan: Penutupan stabil di atas SMA20 disertai volume beli > 1,2x.',
    },
  },
  ETHUSDT: {
    symbol: 'ETHUSDT',
    name: 'Ethereum',
    assetClass: 'Kripto',
    price: '$2.645,50',
    change: '-0,82%',
    isUp: false,
    verdict: 'TAHAN',
    confidence: 60,
    verdictStatus: 'Konsolidasi Akumulasi · Volatilitas Terkendali',
    bullWeight: 50,
    bearWeight: 50,
    analyst: {
      stat1: 'Rasio Volume 20v100: 1,05x (Volume Netral Seimbang)',
      stat2: 'Jarak Harga ke SMA20: -1,2% · SMA50: +3,1%',
      stat3: 'Volatilitas 30H: 34,2% · Support Kuat di SMA100',
      summary: 'Ethereum berkonsolidasi di rentang sempit antara SMA20 dan SMA50. Tidak ada anomali distribusi besar.',
    },
    strategist: {
      thesis: 'Rasio ETH/BTC mulai membentuk dasar siklus. Penurunan gas fee L2 memperkuat fundamental penggunaan on-chain.',
      horizon: '1 - 3 Bulan (Akumulasi Bertahap)',
      target: '+22,5% jika resistensi SMA100 ditembus',
    },
    riskGuardian: {
      vetoActive: false,
      objection: 'Korelasi tinggi dengan pasar ekuitas global. Risiko likuidasi derivatif jika BTC terkoreksi tiba-tiba.',
      stopLoss: 'Batas toleransi maksimal -6,5% di level $2.470',
    },
    chairman: {
      ruling: 'Komite menyetujui TAHAN. Pertahankan alokasi eksisting tanpa menambah eksposur agresif hingga breakout terkonfirmasi.',
      condition: 'Pembatalan: Penembusan ke bawah $2.450 dengan lonjakan volume jual.',
    },
  },
  BBCA: {
    symbol: 'BBCA',
    name: 'Bank Central Asia Tbk',
    assetClass: 'Saham IDX',
    price: 'Rp10.450',
    change: '+0,72%',
    isUp: true,
    verdict: 'BELI',
    confidence: 82,
    verdictStatus: 'Konsensus Kuat · Tren Akumulasi Institusi',
    bullWeight: 75,
    bearWeight: 25,
    analyst: {
      stat1: 'Rasio Volume 20v100: 1,28x (Inflow Institusi Konsisten)',
      stat2: 'Posisi Harga: Di atas SMA20 (+1,8%), SMA50 (+4,2%), SMA200 (+8,9%)',
      stat3: 'Max Drawdown 1 Tahun: Hanya -7,2% (Defensif Sangat Tinggi)',
      summary: 'Struktur tren naik sempurna (Golden Cross multi-horizon). Net foreign buy positif dalam 15 dari 20 sesi terakhir.',
    },
    strategist: {
      thesis: 'Pertumbuhan kredit double digit dan NIM terjaga stabil. Pilihan utama flight to quality di bursa domestik.',
      horizon: '3 - 6 Bulan (Ukuran Posisi Penuh)',
      target: 'Rp11.500 (+10,0% dari harga saat ini)',
    },
    riskGuardian: {
      vetoActive: false,
      objection: 'Valuasi PBV berada di atas rata-rata 5 tahun, namun didukung ROE superior 21%. Tidak ada alasan veto.',
      stopLoss: 'Trailing stop jika turun di bawah SMA50 (Rp10.025)',
    },
    chairman: {
      ruling: 'Komite mengesahkan PUTUSAN BELI dengan skor keyakinan 82%. Risiko terkendali dan momentum akumulasi institusi solid.',
      condition: 'Pembatalan: Penutupan mingguan di bawah SMA50 atau penurunan ROE kuartalan.',
    },
  },
  XAUUSD: {
    symbol: 'XAUUSD',
    name: 'Emas Fisik (Gold Bullion)',
    assetClass: 'Komoditi',
    price: '$2.628,40',
    change: '+1,18%',
    isUp: true,
    verdict: 'BELI',
    confidence: 88,
    verdictStatus: 'All-Time High · Sentimen Lindung Nilai Geopolitik',
    bullWeight: 80,
    bearWeight: 20,
    analyst: {
      stat1: 'Rasio Volume: 1,42x di atas rata-rata kuartalan',
      stat2: 'Jarak Harga ke SMA200: +14,8% (Momentum Kuat Berkelanjutan)',
      stat3: 'Cadangan Emas Bank Sentral Global: Rekor Tertinggi Sepanjang Masa',
      summary: 'Emas menembus rekor harga baru didorong permintaan fisik sovereign dan pelonggaran suku bunga global.',
    },
    strategist: {
      thesis: 'Emas adalah aset lindung nilai moneter primer di tengah fragmentasi geopolitik dan de-dolarisasi cadangan devisa.',
      horizon: '6 - 12 Bulan (Alokasi Strategis Portofolio)',
      target: '$2.800/oz dalam siklus pemotongan suku bunga',
    },
    riskGuardian: {
      vetoActive: false,
      objection: 'RSI harian mendekati level overbought (72), waspadai potensi konsolidasi kilat jangka sangat pendek.',
      stopLoss: 'Batas proteksi di area support retest $2.550',
    },
    chairman: {
      ruling: 'PUTUSAN BELI disahkan dengan keyakinan 88%. Perlindungan terhadap devaluasi mata uang dan eskalasi makro global.',
      condition: 'Pembatalan: Penurunan di bawah $2.500 akibat penguatan tak terduga indeks DXY.',
    },
  },
  BRENT: {
    symbol: 'BRENT',
    name: 'Minyak Mentah Brent',
    assetClass: 'Komoditi',
    price: '$74,80',
    change: '+3,12%',
    isUp: true,
    verdict: 'ABSTAIN',
    confidence: 35,
    verdictStatus: 'Volatilitas Tinggi · Premi Risiko Perang vs Pelemahan Permintaan',
    bullWeight: 40,
    bearWeight: 60,
    analyst: {
      stat1: 'Volatilitas Harian: Lonjakan 4,8% akibat tensi Selat Hormuz',
      stat2: 'Jarak Harga ke SMA50: -2,1% (Struktur Jangka Menengah Masih Bearish)',
      stat3: 'Persediaan Global: Surplus di luar zona konflik',
      summary: 'Lonjakan harga dipicu sentimen berita geopolitik sesaat, bukan defisit permintaan struktural industri.',
    },
    strategist: {
      thesis: 'Potensi lonjakan tajam jika jalur logistik tanker minyak Timur Tengah terganggu secara nyata.',
      horizon: 'Taktis Jangka Pendek (1 - 2 Minggu)',
      target: '$82,00 jika premi perang berlanjut',
    },
    riskGuardian: {
      vetoActive: true,
      objection: 'Struktur fundamental menunjukkan pelemahan manufaktur global. Risiko whipsaw (pembalikan cepat) sangat tinggi.',
      stopLoss: 'Stop-loss ketat di $71,50',
    },
    chairman: {
      ruling: 'Komite memutuskan ABSTAIN. Premi risiko geopolitik tidak dapat diukur secara statistik murni tanpa data pasokan riil.',
      condition: 'Pembatalan: Bukti faktual penurunan pasokan riil > 1,5 juta barel/hari.',
    },
  },
}

interface LandingDeliberationConsoleProps {
  instruments?: InstrumentQuote[]
}

export function LandingDeliberationConsole({ instruments = [] }: LandingDeliberationConsoleProps) {
  const [selectedSymbol, setSelectedSymbol] = useState<string>('BTCUSDT')
  const sample = SAMPLES[selectedSymbol] || SAMPLES.BTCUSDT

  // Sinkronkan harga riil dari instruments jika ada
  const liveQuote = instruments.find((i) => i.symbol === selectedSymbol)
  const displayPrice = liveQuote?.lastClose
    ? (liveQuote.assetClass === 'saham' ? 'Rp' : '$') +
      Number(liveQuote.lastClose).toLocaleString('id-ID')
    : sample.price

  const displayChange = liveQuote?.changePct !== undefined && liveQuote.changePct !== null
    ? (liveQuote.changePct > 0 ? '+' : '') + liveQuote.changePct.toFixed(2) + '%'
    : sample.change

  const isPositive = liveQuote?.changePct !== undefined && liveQuote.changePct !== null
    ? liveQuote.changePct >= 0
    : sample.isUp

  return (
    <section className="landing-section terminal-showcase-section">
      <div className="landing-section-container">
        {/* Section Header */}
        <div className="landing-section-head">
          <div className="landing-strip-title" style={{ marginBottom: '8px' }}>
            <span className="badge-live-pulse" />
            <span className="mono bold" style={{ fontSize: '11px', color: 'var(--signal)', letterSpacing: '0.08em' }}>
              SIMULASI TERMINAL LIVE
            </span>
          </div>
          <h2 className="landing-section-title">Konsol Dialektika Sidang Komite</h2>
          <p className="landing-section-desc">
            Pilih instrumen di bawah untuk menguji perdebatan real-time antara 4 agen AI kuantitatif kami.
            Saksikan bagaimana hak veto pengawas risiko memblokir tesis pertumbuhan yang tidak memiliki bukti statistik.
          </p>
        </div>

        {/* Interactive Asset Switcher Menu Tabs */}
        <div className="console-menu-bar">
          <span className="console-menu-label mono">PILIH INSTRUMEN:</span>
          <div className="console-tabs-scroll hide-scroll">
            {Object.keys(SAMPLES).map((sym) => {
              const item = SAMPLES[sym]
              const isSelected = selectedSymbol === sym
              return (
                <button
                  key={sym}
                  type="button"
                  onClick={() => setSelectedSymbol(sym)}
                  className={`console-tab-btn ${isSelected ? 'active' : ''}`}
                >
                  <AssetIcon symbol={sym} size={15} />
                  <span className="mono bold">{sym}</span>
                  <span className="tab-class-tag mono">{item.assetClass}</span>
                  {isSelected && <span className="tab-active-indicator" />}
                </button>
              )
            })}
          </div>
        </div>

        {/* The Live Deliberation Terminal Board */}
        <div className="console-terminal-shell">
          {/* Top Bar: Asset Quote & Verdict Banner */}
          <div className="console-top-strip">
            <div className="console-asset-info">
              <div className="asset-headline">
                <AssetIcon symbol={sample.symbol} size={24} />
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h3 className="mono bold" style={{ fontSize: '18px', color: 'var(--ink)' }}>
                      {sample.symbol}
                    </h3>
                    <span className="tag mono" style={{ fontSize: '10px' }}>
                      {sample.name} · {sample.assetClass}
                    </span>
                  </div>
                  <div className="asset-price-row mono">
                    <span className="live-price">{displayPrice}</span>
                    <span className={`live-change ${isPositive ? 'trend-up' : 'trend-down'}`}>
                      {isPositive ? <IconTrendUp size={13} /> : <IconTrendDown size={13} />}
                      {displayChange}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Official Verdict Badge */}
            <div className="console-verdict-box">
              <div className="verdict-label-row mono">
                <span>PUTUSAN RESMI KOMITE</span>
                <span className="mono bold" style={{ color: 'var(--amber)' }}>
                  KEYAKINAN: {sample.confidence}%
                </span>
              </div>
              <div className="verdict-badge-row">
                <span
                  className={`verdict-stamp verdict-${sample.verdict.toLowerCase()} mono bold`}
                >
                  {sample.verdict}
                </span>
                <div className="verdict-status-desc">
                  <div className="status-title mono bold">{sample.verdictStatus}</div>
                  <div className="confidence-meter-bg">
                    <div
                      className="confidence-meter-fill"
                      style={{
                        width: `${sample.confidence}%`,
                        background:
                          sample.verdict === 'BELI'
                            ? 'var(--green)'
                            : sample.verdict === 'ABSTAIN'
                            ? 'var(--amber)'
                            : 'var(--signal)',
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Committee Dialectics Tension Meter */}
          <div className="console-tension-bar">
            <div className="tension-info mono">
              <span className="tension-side trend-up">
                <IconTrendUp size={12} />
                <span>Strateg (Bull): {sample.bullWeight}%</span>
              </span>
              <span className="tension-caption">TENSI DIALEKTIKA SIDANG</span>
              <span className="tension-side trend-down">
                <IconTrendDown size={12} />
                <span>Pengawas Risiko (Bear): {sample.bearWeight}%</span>
              </span>
            </div>
            <div className="tension-track">
              <div className="tension-bull-fill" style={{ width: `${sample.bullWeight}%` }} />
              <div className="tension-bear-fill" style={{ width: `${sample.bearWeight}%` }} />
            </div>
          </div>

          {/* 4-Agent Deliberation Grid */}
          <div className="console-agents-grid">
            {/* Agent 1: Data Analyst */}
            <div className="console-agent-card">
              <div className="agent-card-top">
                <div className="agent-icon-pill" style={{ color: 'var(--blue)', borderColor: 'var(--blue)' }}>
                  <IconCandles size={14} />
                  <span className="mono bold">Fakta Kuantitatif</span>
                </div>
                <span className="mono" style={{ fontSize: '10px', color: 'var(--ink-faint)' }}>
                  0% Halusinasi
                </span>
              </div>
              <h4 className="agent-card-title">Analis Data Kuantitatif</h4>
              <div className="agent-metrics-list mono">
                <div className="metric-chip">{sample.analyst.stat1}</div>
                <div className="metric-chip">{sample.analyst.stat2}</div>
                <div className="metric-chip">{sample.analyst.stat3}</div>
              </div>
              <p className="agent-quote">&ldquo;{sample.analyst.summary}&rdquo;</p>
            </div>

            {/* Agent 2: Portfolio Strategist */}
            <div className="console-agent-card">
              <div className="agent-card-top">
                <div className="agent-icon-pill" style={{ color: 'var(--green)', borderColor: 'var(--green)' }}>
                  <IconTarget size={14} />
                  <span className="mono bold">Tesis Pertumbuhan</span>
                </div>
                <span className="mono" style={{ fontSize: '10px', color: 'var(--green)' }}>
                  Bullish
                </span>
              </div>
              <h4 className="agent-card-title">Strateg Portofolio</h4>
              <p className="agent-quote">&ldquo;{sample.strategist.thesis}&rdquo;</p>
              <div className="agent-extra-data mono">
                <div><strong>Horizon:</strong> {sample.strategist.horizon}</div>
                <div><strong>Target:</strong> {sample.strategist.target}</div>
              </div>
            </div>

            {/* Agent 3: Risk Guardian */}
            <div className="console-agent-card">
              <div className="agent-card-top">
                <div className="agent-icon-pill" style={{ color: 'var(--red)', borderColor: 'var(--red)' }}>
                  <IconShield size={14} />
                  <span className="mono bold">Proteksi Modal</span>
                </div>
                {sample.riskGuardian.vetoActive && (
                  <span className="tag mono" style={{ color: 'var(--red)', borderColor: 'var(--red)', fontSize: '9px' }}>
                    VETO AKTIF
                  </span>
                )}
              </div>
              <h4 className="agent-card-title">Pengawas Risiko</h4>
              <p className="agent-quote agent-warning">&ldquo;{sample.riskGuardian.objection}&rdquo;</p>
              <div className="agent-extra-data mono">
                <div><strong>Stop Loss:</strong> {sample.riskGuardian.stopLoss}</div>
              </div>
            </div>

            {/* Agent 4: Chairman */}
            <div className="console-agent-card highlight-card">
              <div className="agent-card-top">
                <div className="agent-icon-pill" style={{ color: 'var(--amber)', borderColor: 'var(--amber)' }}>
                  <IconScales size={14} />
                  <span className="mono bold">Putusan Akhir</span>
                </div>
                <span className="mono" style={{ fontSize: '10px', color: 'var(--amber)' }}>
                  Konsensus
                </span>
              </div>
              <h4 className="agent-card-title">Ketua Komite</h4>
              <p className="agent-quote">&ldquo;{sample.chairman.ruling}&rdquo;</p>
              <div className="agent-extra-data mono" style={{ color: 'var(--ink-soft)' }}>
                <div><strong>Syarat:</strong> {sample.chairman.condition}</div>
              </div>
            </div>
          </div>

          {/* Console Bottom Action Strip */}
          <div className="console-bottom-actions">
            <div className="console-foot-note mono">
              <span className="badge-live-pulse" style={{ width: '5px', height: '5px' }} />
              <span>
                Sidang diperbarui setiap penutupan candle harian · Menjangkau seluruh 448 instrumen aktif
              </span>
            </div>
            <Link
              href={`/ringkasan?symbol=${sample.symbol}`}
              className="btn btn-primary"
              style={{ padding: '8px 16px', fontSize: '12px' }}
            >
              <IconGauge size={14} />
              <span>Buka Analisis Penuh {sample.symbol} di Terminal</span>
              <IconArrowRight size={13} />
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
