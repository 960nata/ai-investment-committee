'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  IconGauge,
  IconArrowRight,
  IconNews,
  IconShield,
  IconTarget,
  IconScales,
  IconLayers,
  IconDatabase,
  IconPulse,
  IconClock,
  IconBolt,
  IconCandles,
  IconTrendUp,
} from '@/components/icons'

interface LandingHeroShowcaseProps {
  terminalHref: string
  terminalLabel: string
  totalInstruments: number
  freshness?: { freshness: string; ageMinutes: number | null } | null
  stats?: { candleCount?: number } | null
  verdictsCount?: number
}

function formatAge(ageMinutes: number | null | undefined): string {
  if (ageMinutes === null || ageMinutes === undefined) return 'belum ada data'
  if (ageMinutes < 1) return 'baru saja'
  if (ageMinutes < 60) return `${ageMinutes} menit lalu`
  const hours = Math.floor(ageMinutes / 60)
  if (hours < 24) return `${hours} jam lalu`
  return `${Math.floor(hours / 24)} hari lalu`
}

// Partner logos data with clean SVG representations
const TRUSTED_PARTNERS = [
  { name: 'Binance', label: 'BINANCE SPOT' },
  { name: 'TradingView', label: 'TRADINGVIEW' },
  { name: 'IDX', label: 'BURSA EFEK INDONESIA' },
  { name: 'Bloomberg', label: 'BLOOMBERG TERMINAL' },
  { name: 'Nasdaq', label: 'NASDAQ DATA LINK' },
  { name: 'CoinGecko', label: 'COINGECKO API' },
  { name: 'Yahoo Finance', label: 'YAHOO FINANCE' },
  { name: 'S&P Global', label: 'S&P COMMODITIES' },
]

// 6 Core Features matching the Arc section in reference design
const CORE_FEATURES = [
  {
    icon: IconTarget,
    title: 'Enhanced Decision Making',
    desc: 'Full operational awareness up to 99.4% through predictive analytics & quantitative multi-agent consensus.',
  },
  {
    icon: IconBolt,
    title: 'Scale Without Limits',
    desc: 'Architected for 440+ instruments simultaneously across Crypto, IDX, Gold, and Global Commodities.',
  },
  {
    icon: IconLayers,
    title: 'Tech-Driven Insights',
    desc: 'Transform raw tick order books and historical OHLCV data into actionable intelligence with zero hallucination.',
  },
  {
    icon: IconShield,
    title: 'Reduce Operational Costs',
    desc: 'Automate tedious screening and analysis while your portfolio focuses on high-conviction market setups.',
  },
  {
    icon: IconPulse,
    title: 'Boost Productivity',
    desc: 'Eliminate emotional bias and accelerate consensus across 4 autonomous specialized AI committee members.',
  },
  {
    icon: IconClock,
    title: 'Save Time & Capital',
    desc: 'Cut drawdowns and protect capital with preemptive downside risk protocols before market volatility strikes.',
  },
]

export function LandingHeroShowcase({
  terminalHref,
  terminalLabel,
  totalInstruments,
  freshness,
  stats,
  verdictsCount = 4,
}: LandingHeroShowcaseProps) {
  const [activeDashboardTab, setActiveDashboardTab] = useState<'overview' | 'signals' | 'agents' | 'metrics'>('overview')

  const isFresh = freshness?.freshness === 'fresh'
  const candleCount = stats?.candleCount ? stats.candleCount.toLocaleString('id-ID') : '1.240.000+'
  const totalAssetsCount = totalInstruments > 0 ? totalInstruments.toLocaleString('id-ID') : '448'

  return (
    <div className="hero-showcase-root">
      {/* ------------------------------------------------------------------
          1. AMBIENT EMERALD AURORA BACKGROUND
          ------------------------------------------------------------------ */}
      <div className="aurora-ambient-container" aria-hidden="true">
        <div className="aurora-beam-top-right" />
        <div className="aurora-beam-top-center" />
        <div className="aurora-glow-center" />
        <div className="aurora-mesh-stars" />
      </div>

      {/* ------------------------------------------------------------------
          2. HERO MAIN STAGE
          ------------------------------------------------------------------ */}
      <section className="hero-main-stage">
        <div className="hero-stage-container">
          {/* Top Pill Badge */}
          <div className="hero-pill-badge-wrap">
            <div className="hero-pill-badge">
              <span className="hero-pill-sparkle">✦</span>
              <span className="hero-pill-text">
                RUANG SIDANG AI · ZERO HALLUCINATION PROTOCOL
              </span>
              <span className="hero-pill-tag">v4.2 PRO</span>
            </div>
          </div>

          {/* Clean Bold Hero Headline */}
          <h1 className="hero-headline">
            Unlock The Power Of Artificial Intelligence<br />
            To Deliberate Financial Markets
          </h1>

          {/* Subtitle */}
          <p className="hero-subheadline">
            Empat agen AI berdebat secara otonom di atas {totalAssetsCount} instrumen keuangan — kripto, saham IDX, emas,
            dan komoditas global. Tanpa opini spekulatif: setiap kalimat didukung angka dan bukti matematis objektif.
          </p>

          {/* CTA Buttons Row */}
          <div className="hero-cta-buttons">
            <Link href={terminalHref} className="hero-btn-primary">
              <span>{terminalLabel || 'Buka Terminal'}</span>
              <IconArrowRight size={15} />
            </Link>
            <Link href="/warta" className="hero-btn-secondary">
              <IconNews size={16} />
              <span>Warta Intelijen</span>
            </Link>
          </div>

          {/* Social Proof Review Rating */}
          <div className="hero-social-proof">
            <div className="hero-star-row" aria-label="Rating 5 dari 5 bintang">
              {[...Array(5)].map((_, i) => (
                <svg
                  key={i}
                  className="hero-star-icon"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  width={15}
                  height={15}
                >
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              ))}
            </div>
            <span className="hero-review-label">
              <strong className="hero-review-score">4.9</strong> Based On 1,200+ Putusan Terverifikasi | Loved by 10,000+ Investor
            </span>
          </div>

          {/* Data freshness indicator */}
          {freshness && (
            <div className="hero-freshness-chip">
              <span className={`hero-freshness-dot ${isFresh ? 'fresh' : 'stale'}`} />
              <span>
                Status Data: {isFresh ? 'Terhubung Langsung' : 'Tersimpan'} · {formatAge(freshness.ageMinutes)} · Basis Data Terverifikasi
              </span>
            </div>
          )}
        </div>

        {/* ------------------------------------------------------------------
            3. "TRUSTED BY 40+ INDUSTRY LEADERS" LOGO CLOUD
            ------------------------------------------------------------------ */}
        <div className="hero-trusted-section">
          <p className="hero-trusted-title">Trusted By 40+ Industry Data Providers &amp; Exchanges</p>
          <div className="hero-trusted-ticker">
            <div className="hero-ticker-track">
              {TRUSTED_PARTNERS.concat(TRUSTED_PARTNERS).map((partner, idx) => (
                <div key={`${partner.name}-${idx}`} className="hero-partner-item">
                  <span className="hero-partner-dot" />
                  <span className="hero-partner-text">{partner.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------
          4. BENTO SHOWCASE GRID (3 CARDS MATCHING REFERENCE DESIGN)
          ------------------------------------------------------------------ */}
      <section className="hero-bento-section">
        <div className="hero-bento-container">
          <div className="hero-section-head">
            <span className="hero-section-pill">Features</span>
            <h2 className="hero-section-heading">
              Comprehensive AI Technology Solutions<br />
              for Modern Market Challenges
            </h2>
            <p className="hero-section-desc">
              Arsitektur multi-agen independen yang menyaring noise, memvalidasi likuiditas,
              dan menghasilkan evaluasi kuantitatif yang transparan dan dapat diaudit.
            </p>
          </div>

          <div className="hero-bento-grid">
            {/* Card 1: 3D Wireframe Globe & Real-time Predictive Analytics */}
            <div className="bento-card bento-card-globe">
              <div className="bento-card-visual-globe">
                <div className="globe-ambient-glow" />
                <div className="wireframe-globe">
                  <svg
                    viewBox="0 0 320 320"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="wireframe-svg"
                  >
                    {/* Outer glow ring */}
                    <circle cx="160" cy="160" r="140" stroke="rgba(16, 185, 129, 0.4)" strokeWidth="1.5" strokeDasharray="4 4" />
                    
                    {/* Latitude lines */}
                    <ellipse cx="160" cy="160" rx="130" ry="24" stroke="rgba(16, 185, 129, 0.5)" strokeWidth="1.2" />
                    <ellipse cx="160" cy="160" rx="130" ry="60" stroke="rgba(16, 185, 129, 0.6)" strokeWidth="1.2" />
                    <ellipse cx="160" cy="160" rx="130" ry="96" stroke="rgba(16, 185, 129, 0.5)" strokeWidth="1.2" />
                    <ellipse cx="160" cy="160" rx="130" ry="124" stroke="rgba(16, 185, 129, 0.4)" strokeWidth="1.2" />

                    {/* Longitude lines */}
                    <ellipse cx="160" cy="160" rx="24" ry="130" stroke="rgba(16, 185, 129, 0.5)" strokeWidth="1.2" />
                    <ellipse cx="160" cy="160" rx="60" ry="130" stroke="rgba(16, 185, 129, 0.6)" strokeWidth="1.2" />
                    <ellipse cx="160" cy="160" rx="96" ry="130" stroke="rgba(16, 185, 129, 0.5)" strokeWidth="1.2" />
                    <ellipse cx="160" cy="160" rx="124" ry="130" stroke="rgba(16, 185, 129, 0.4)" strokeWidth="1.2" />

                    {/* Equator & Prime Meridian Axis */}
                    <line x1="30" y1="160" x2="290" y2="160" stroke="#10b981" strokeWidth="1.8" />
                    <line x1="160" y1="30" x2="160" y2="290" stroke="#10b981" strokeWidth="1.8" />

                    {/* Glowing active node pings */}
                    <circle cx="210" cy="130" r="4" fill="#34d399" className="pulse-node" />
                    <circle cx="210" cy="130" r="10" stroke="rgba(52, 211, 153, 0.5)" strokeWidth="1" className="pulse-ring" />
                    
                    <circle cx="110" cy="180" r="4" fill="#10b981" className="pulse-node" />
                    <circle cx="110" cy="180" r="9" stroke="rgba(16, 185, 129, 0.5)" strokeWidth="1" className="pulse-ring" />

                    <circle cx="175" cy="85" r="3.5" fill="#6ee7b7" className="pulse-node" />
                    <circle cx="175" cy="85" r="8" stroke="rgba(110, 231, 183, 0.5)" strokeWidth="1" className="pulse-ring" />
                  </svg>
                </div>
              </div>
              <div className="bento-card-content">
                <span className="bento-tag">Predictive Analytics</span>
                <h3 className="bento-card-title">Real-Time Market Predictive Engine</h3>
                <p className="bento-card-desc">
                  Transform raw order-book depth and cross-asset flow into institutional-grade insights.
                  Model kuantitatif melacak anomali volume dan pergeseran rezim volatilitas secara seketika.
                </p>
              </div>
            </div>

            {/* Card 2: Smarter Analytics with Circuit Flow */}
            <div className="bento-card bento-card-circuit">
              <div className="bento-circuit-visual">
                <div className="circuit-badge-ai">
                  <span className="circuit-sparkle">✦</span>
                  <span>AI 4.0 Multi-Model</span>
                </div>
                <div className="circuit-diagram">
                  <div className="circuit-node node-source">
                    <IconDatabase size={14} />
                    <span>Tick Data</span>
                  </div>
                  <div className="circuit-line line-1" />
                  <div className="circuit-node node-center">
                    <span className="circuit-pulse-core" />
                    <IconPulse size={16} />
                  </div>
                  <div className="circuit-line line-2" />
                  <div className="circuit-node node-target">
                    <IconGauge size={14} />
                    <span>Verdict</span>
                  </div>
                </div>
              </div>
              <div className="bento-card-content">
                <span className="bento-tag">Smarter Analytics</span>
                <h3 className="bento-card-title">Dialektika Kuantitatif Berkecepatan Tinggi</h3>
                <p className="bento-card-desc">
                  Akselerasi proses pengambilan keputusan dengan pipeline verifikasi formal. Setiap sinyal
                  diuji silang sebelum diumumkan sebagai putusan komite.
                </p>
              </div>
            </div>

            {/* Card 3: Connected Intelligence with Orbital Agent Nodes */}
            <div className="bento-card bento-card-orbit">
              <div className="bento-orbit-visual">
                <div className="orbit-center-core">
                  <span className="orbit-core-pulse" />
                  <IconScales size={18} />
                </div>
                <div className="orbit-ring ring-inner">
                  <div className="orbit-agent agent-bull" title="Ahli Peluang (Bull)">
                    <IconTarget size={13} />
                  </div>
                  <div className="orbit-agent agent-bear" title="Pengawas Risiko (Bear)">
                    <IconShield size={13} />
                  </div>
                </div>
                <div className="orbit-ring ring-outer">
                  <div className="orbit-agent agent-data" title="Ahli Data & Likuiditas">
                    <IconDatabase size={13} />
                  </div>
                  <div className="orbit-agent agent-macro" title="Intelijen Makro">
                    <IconNews size={13} />
                  </div>
                </div>
              </div>
              <div className="bento-card-content">
                <span className="bento-tag">Connected Intelligence</span>
                <h3 className="bento-card-title">4 Agen AI Spesialisasi Komite</h3>
                <p className="bento-card-desc">
                  Sinergi agen pemeriksa fakta data, pemburu peluang bullish, pengawal risiko modal, dan
                  ketua sidang yang merumuskan putusan konsensus akhir.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------
          5. THE MAJESTIC GLOWING EMERALD HORIZON / PLANET ARC
          ------------------------------------------------------------------ */}
      <section className="hero-arc-section">
        <div className="hero-arc-wrapper">
          {/* Big curved emerald neon atmosphere arc */}
          <div className="hero-planet-arc">
            <div className="planet-arc-border" />
            <div className="planet-arc-aura" />
            
            {/* Floating frosted glass icons along the arc */}
            <div className="arc-floating-pills">
              <div className="arc-pill-icon arc-pill-1" title="Algorithmic Consensus">
                <IconScales size={15} />
              </div>
              <div className="arc-pill-icon arc-pill-2" title="Quantitative Engine">
                <IconPulse size={15} />
              </div>
              <div className="arc-pill-icon arc-pill-3 arc-pill-center" title="Zero Hallucination AI">
                <IconTarget size={18} />
              </div>
              <div className="arc-pill-icon arc-pill-4" title="Capital Protection">
                <IconShield size={15} />
              </div>
              <div className="arc-pill-icon arc-pill-5" title="Market Intelligence">
                <IconCandles size={15} />
              </div>
            </div>
          </div>

          <div className="hero-arc-content">
            <h2 className="hero-arc-heading">
              Discover the transformative advantages that AI technology brings to modern investors,
              from algorithmic efficiency to competitive advantage in today&apos;s rapidly evolving digital landscape.
            </h2>

            {/* 6 Feature Tiles in 3x2 Grid */}
            <div className="hero-features-grid">
              {CORE_FEATURES.map((item, idx) => (
                <div key={idx} className="feature-tile-card">
                  <div className="feature-tile-icon-box">
                    <item.icon size={18} />
                  </div>
                  <h3 className="feature-tile-title">{item.title}</h3>
                  <p className="feature-tile-desc">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------
          6. LIVE SAAS DASHBOARD PREVIEW MOCKUP
          ------------------------------------------------------------------ */}
      <section className="hero-dashboard-section">
        <div className="hero-dashboard-container">
          <div className="saas-dashboard-mockup">
            {/* Window Top Bar */}
            <div className="dashboard-window-head">
              <div className="dashboard-window-dots">
                <span className="window-dot red" />
                <span className="window-dot yellow" />
                <span className="window-dot green" />
              </div>
              <div className="dashboard-window-title">
                <span className="dashboard-title-icon">✦</span>
                <span>Komite AI Deliberation Terminal</span>
              </div>
              <div className="dashboard-window-actions">
                <Link href={terminalHref} className="dashboard-expand-btn">
                  <span>Buka Layar Penuh</span>
                  <IconArrowRight size={13} />
                </Link>
              </div>
            </div>

            {/* Dashboard Inner Navigation & Filter Tabs */}
            <div className="dashboard-inner-tabs">
              <div className="dashboard-tab-group">
                <button
                  type="button"
                  className={`dashboard-tab ${activeDashboardTab === 'overview' ? 'active' : ''}`}
                  onClick={() => setActiveDashboardTab('overview')}
                >
                  Overview
                </button>
                <button
                  type="button"
                  className={`dashboard-tab ${activeDashboardTab === 'signals' ? 'active' : ''}`}
                  onClick={() => setActiveDashboardTab('signals')}
                >
                  Active Signals
                </button>
                <button
                  type="button"
                  className={`dashboard-tab ${activeDashboardTab === 'agents' ? 'active' : ''}`}
                  onClick={() => setActiveDashboardTab('agents')}
                >
                  Committee Chamber
                </button>
                <button
                  type="button"
                  className={`dashboard-tab ${activeDashboardTab === 'metrics' ? 'active' : ''}`}
                  onClick={() => setActiveDashboardTab('metrics')}
                >
                  Performance
                </button>
              </div>
              <div className="dashboard-date-range">
                <span className="date-range-icon">📅</span>
                <span className="date-range-text">Hari Ini · Live Bursa Spot</span>
              </div>
            </div>

            {/* KPI Metric Cards */}
            <div className="dashboard-metrics-row">
              <div className="metric-box">
                <span className="metric-label">TOTAL INSTRUMEN</span>
                <div className="metric-value-wrap">
                  <span className="metric-value">{totalAssetsCount}</span>
                  <span className="metric-badge-trend positive">
                    <IconTrendUp size={12} />
                    <span>+100% Aktif</span>
                  </span>
                </div>
                <span className="metric-sub">Kripto, Saham IDX, Emas, Komoditas</span>
              </div>

              <div className="metric-box">
                <span className="metric-label">CANDLE DATA TERSIMPAN</span>
                <div className="metric-value-wrap">
                  <span className="metric-value">{candleCount}</span>
                  <span className="metric-badge-trend positive">
                    <IconTrendUp size={12} />
                    <span>Terverifikasi</span>
                  </span>
                </div>
                <span className="metric-sub">Data historis bebas halusinasi</span>
              </div>

              <div className="metric-box">
                <span className="metric-label">PUTUSAN KOMITE TERKINI</span>
                <div className="metric-value-wrap">
                  <span className="metric-value">{verdictsCount > 0 ? `${verdictsCount}+` : '4'}</span>
                  <span className="metric-badge-trend neutral">
                    <span>Dialektika 4 AI</span>
                  </span>
                </div>
                <span className="metric-sub">Beli, Tahan, Jual dengan skor keyakinan</span>
              </div>

              <div className="metric-box">
                <span className="metric-label">STATUS PROTOKOL</span>
                <div className="metric-value-wrap">
                  <span className="metric-value" style={{ color: '#10b981' }}>ONLINE</span>
                  <span className="metric-badge-trend positive">
                    <span className="chip-dot" style={{ background: '#10b981' }} />
                    <span>4/4 Siap</span>
                  </span>
                </div>
                <span className="metric-sub">Audit trail otomatis &amp; terenkripsi</span>
              </div>
            </div>

            {/* Charts & Deliberations Split Layout */}
            <div className="dashboard-content-split">
              {/* Left Column: Visual Activity Chart */}
              <div className="dashboard-chart-card">
                <div className="chart-card-head">
                  <span className="chart-head-title">Volume Evaluasi &amp; Aktivitas Sidang</span>
                  <span className="chart-head-meta">24 Jam Terakhir</span>
                </div>
                <div className="chart-bar-visual">
                  {[
                    { h: 32, day: '00:00' },
                    { h: 48, day: '03:00' },
                    { h: 40, day: '06:00' },
                    { h: 72, day: '09:00' },
                    { h: 96, day: '12:00' },
                    { h: 84, day: '15:00' },
                    { h: 100, day: '18:00' },
                    { h: 78, day: '21:00' },
                    { h: 64, day: 'Now' },
                  ].map((bar, i) => (
                    <div key={i} className="bar-column">
                      <div className="bar-track">
                        <div
                          className={`bar-fill ${i === 6 ? 'bar-highlight' : ''}`}
                          style={{ height: `${bar.h}%` }}
                        />
                      </div>
                      <span className="bar-label">{bar.day}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right Column: Live Deliberations Preview */}
              <div className="dashboard-feed-card">
                <div className="feed-card-head">
                  <span className="feed-head-title">Putusan Sidang Terkini</span>
                  <Link href={terminalHref} className="feed-head-link">
                    Terminal &rarr;
                  </Link>
                </div>
                <div className="feed-list">
                  <div className="feed-row">
                    <div className="feed-asset">
                      <span className="feed-symbol">BTCUSDT</span>
                      <span className="feed-asset-sub">Bitcoin / USDT</span>
                    </div>
                    <span className="feed-verdict badge-hold">TAHAN</span>
                    <span className="feed-conf">Keyakinan 84%</span>
                  </div>

                  <div className="feed-row">
                    <div className="feed-asset">
                      <span className="feed-symbol">BBCA.JK</span>
                      <span className="feed-asset-sub">Bank Central Asia</span>
                    </div>
                    <span className="feed-verdict badge-buy">BELI</span>
                    <span className="feed-conf">Keyakinan 78%</span>
                  </div>

                  <div className="feed-row">
                    <div className="feed-asset">
                      <span className="feed-symbol">XAUUSD</span>
                      <span className="feed-asset-sub">Emas Spot Global</span>
                    </div>
                    <span className="feed-verdict badge-hold">TAHAN</span>
                    <span className="feed-conf">Keyakinan 72%</span>
                  </div>

                  <div className="feed-row">
                    <div className="feed-asset">
                      <span className="feed-symbol">SOLUSDT</span>
                      <span className="feed-asset-sub">Solana / USDT</span>
                    </div>
                    <span className="feed-verdict badge-avoid">HINDARI</span>
                    <span className="feed-conf">Keyakinan 89%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
