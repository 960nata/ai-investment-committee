'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import Link from 'next/link'
import {
  IconPulse,
  IconGauge,
  IconRows,
  IconNews,
  IconShield,
  IconTarget,
  IconScales,
  IconCandles,
  IconFlow,
  IconLock,
  IconArrowRight,
  IconMenu,
  IconClose,
  IconSearch,
} from '@/components/icons'
import { AssetIcon } from '@/components/asset-icons'
import type { InstrumentQuote } from '@/lib/db/queries'

interface LandingNavProps {
  instruments?: InstrumentQuote[]
  topAssets: InstrumentQuote[]
  freshnessLabel?: string
  isFresh?: boolean
}

export function LandingNav({
  instruments = [],
  topAssets = [],
  freshnessLabel = 'Data Segar',
  isFresh = true,
}: LandingNavProps) {
  const [activeMenu, setActiveMenu] = useState<string | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchFilter, setSearchFilter] = useState<'all' | 'crypto' | 'saham' | 'komoditi'>('all')
  const menuTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  function closeSearch() {
    setSearchOpen(false)
    setSearchQuery('')
  }

  function handleMouseEnter(menuName: string) {
    if (menuTimeoutRef.current) clearTimeout(menuTimeoutRef.current)
    setActiveMenu(menuName)
  }

  function handleMouseLeave() {
    menuTimeoutRef.current = setTimeout(() => {
      setActiveMenu(null)
    }, 200)
  }

  // Keyboard shortcut: Cmd+K / Ctrl+K or '/' to open search palette, Esc to close
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen((prev) => !prev)
      } else if (e.key === '/' && !searchOpen) {
        const activeTag = document.activeElement?.tagName.toLowerCase()
        if (activeTag !== 'input' && activeTag !== 'textarea') {
          e.preventDefault()
          setSearchOpen(true)
        }
      } else if (e.key === 'Escape') {
        setActiveMenu(null)
        setMobileOpen(false)
        setSearchOpen(false)
        setSearchQuery('')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [searchOpen])

  // Focus input when search modal opens
  useEffect(() => {
    if (searchOpen) {
      const timer = setTimeout(() => {
        searchInputRef.current?.focus()
      }, 50)
      return () => clearTimeout(timer)
    }
  }, [searchOpen])

  // Ticker items
  const tickerList = useMemo(() => {
    if (topAssets.length >= 4) return topAssets
    return instruments.slice(0, 6)
  }, [topAssets, instruments])

  // Top gainers and losers calculation for the mega menu radar
  const { topGainers, topLosers } = useMemo(() => {
    const sorted = [...instruments].filter((i) => i.changePct !== null && i.changePct !== undefined)
    sorted.sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0))
    return {
      topGainers: sorted.slice(0, 3),
      topLosers: sorted.slice(-3).reverse(),
    }
  }, [instruments])

  // Filtered search results
  const searchResults = useMemo(() => {
    if (!instruments.length) return []
    const q = searchQuery.trim().toLowerCase()
    return instruments
      .filter((inst) => {
        if (searchFilter === 'crypto' && inst.assetClass !== 'crypto' && inst.assetClass !== 'memecoin') return false
        if (searchFilter === 'saham' && inst.assetClass !== 'saham') return false
        if (searchFilter === 'komoditi' && inst.assetClass !== 'komoditi' && inst.assetClass !== 'emas') return false
        if (!q) return true
        return (
          inst.symbol.toLowerCase().includes(q) ||
          inst.name.toLowerCase().includes(q) ||
          inst.assetClass.toLowerCase().includes(q)
        )
      })
      .slice(0, 8)
  }, [instruments, searchQuery, searchFilter])

  return (
    <>
      {/* 1. TOP STATUS TICKER TAPE (Pita Status Pasar & Realtime Quotes) */}
      <div className="landing-top-ribbon">
        <div className="landing-ribbon-container">
          <div className="ribbon-left">
            <span className="badge-live-pulse" style={{ width: '6px', height: '6px' }} />
            <span className="mono bold ribbon-title">
              ZERO HALLUCINATION ENGINE
            </span>
            <span className="ribbon-sep">|</span>
            <span className="mono ribbon-sub">
              {instruments.length > 0 ? `${instruments.length} INSTRUMEN` : '448 INSTRUMEN'}
            </span>
            <span className="ribbon-sep">|</span>
            <span className="mono" style={{ fontSize: '10px', color: isFresh ? 'var(--green)' : 'var(--signal)' }}>
              {freshnessLabel}
            </span>
            <span className="ribbon-sep">|</span>
            <span className="mono ribbon-latency" style={{ fontSize: '10px', color: 'var(--ink-faint)' }}>
              KYOTO · 18ms
            </span>
          </div>

          <div className="ribbon-right mono">
            {tickerList.map((asset) => {
              const isPositive = (asset.changePct ?? 0) >= 0
              return (
                <Link
                  key={asset.id}
                  href={`/ringkasan?symbol=${asset.symbol}`}
                  className="ribbon-ticker-item"
                >
                  <AssetIcon symbol={asset.symbol} size={12} />
                  <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{asset.symbol}</span>
                  <span style={{ color: 'var(--ink-soft)' }}>
                    {asset.lastClose
                      ? (asset.assetClass === 'saham' ? 'Rp' : '$') +
                        Number(asset.lastClose).toLocaleString('id-ID')
                      : '-'}
                  </span>
                  <span className={isPositive ? 'trend-up' : 'trend-down'}>
                    {isPositive ? '+' : ''}
                    {asset.changePct ? asset.changePct.toFixed(1) + '%' : '0.0%'}
                  </span>
                </Link>
              )
            })}
          </div>
        </div>
      </div>

      {/* 2. MAIN NAVIGATION HEADER */}
      <header className="landing-header">
        <div className="landing-nav-container">
          {/* Brand Logo with Version Tag */}
          <Link href="/" className="landing-brand">
            <span className="mark-glyph">
              <IconPulse size={16} />
            </span>
            <span className="mark-name">Komite</span>
            <span className="mark-phase">PRO v2.4</span>
          </Link>

          {/* Center Navigation Links with Mega Dropdown Paneling */}
          <nav className="landing-nav-links" onMouseLeave={handleMouseLeave}>
            {/* Menu 1: Pasar & 448 Instrumen */}
            <div
              className="nav-dropdown-trigger"
              onMouseEnter={() => handleMouseEnter('pasar')}
            >
              <button
                type="button"
                className={`nav-trigger-btn ${activeMenu === 'pasar' ? 'active' : ''}`}
                onClick={() => setActiveMenu(activeMenu === 'pasar' ? null : 'pasar')}
              >
                <IconRows size={14} />
                <span>Pasar &amp; Instrumen</span>
                <span className="tag mono nav-badge" style={{ fontSize: '9px', padding: '1px 4px' }}>
                  448
                </span>
                <span className="nav-chevron">▾</span>
              </button>

              {activeMenu === 'pasar' && (
                <div className="mega-menu mega-menu-wide-3col">
                  <div className="mega-menu-grid-3col">
                    {/* Col 1: Terminal Hub */}
                    <div className="mega-col">
                      <span className="mega-col-title mono">Modul Terminal</span>
                      <Link href="/ringkasan" className="mega-item" onClick={() => setActiveMenu(null)}>
                        <div className="mega-item-icon">
                          <IconGauge size={16} />
                        </div>
                        <div>
                          <div className="mega-item-name">Ringkasan Pasar &amp; Deliberasi</div>
                          <div className="mega-item-desc">Grafik candlestick harian, dialektika 4 agen &amp; putusan terikat</div>
                        </div>
                      </Link>

                      <Link href="/instruments" className="mega-item" onClick={() => setActiveMenu(null)}>
                        <div className="mega-item-icon">
                          <IconRows size={16} />
                        </div>
                        <div>
                          <div className="mega-item-name">Katalog 448 Instrumen</div>
                          <div className="mega-item-desc">Kripto, Saham IDX, Logam Mulia, dan Komoditas Global lengkap</div>
                        </div>
                      </Link>

                      <Link href="/ringkasan?tab=veto" className="mega-item" onClick={() => setActiveMenu(null)}>
                        <div className="mega-item-icon" style={{ color: 'var(--red)' }}>
                          <IconShield size={16} />
                        </div>
                        <div>
                          <div className="mega-item-name">Radar Volatilitas &amp; Veto</div>
                          <div className="mega-item-desc">Instrumen dalam status peringatan koreksi dan deadlock risiko</div>
                        </div>
                      </Link>
                    </div>

                    {/* Col 2: Live Asset Classes */}
                    <div className="mega-col mega-col-border">
                      <span className="mega-col-title mono">Kelas Aset Unggulan</span>
                      <div className="mega-asset-list">
                        <Link href="/ringkasan?tab=crypto" className="mega-asset-row" onClick={() => setActiveMenu(null)}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span className="chip-dot" style={{ background: 'var(--amber)' }} />
                            <span className="mono bold">Kripto &amp; Meme</span>
                          </div>
                          <span className="tag mono" style={{ fontSize: '9px' }}>BTC, ETH, SOL</span>
                        </Link>

                        <Link href="/ringkasan?tab=saham" className="mega-asset-row" onClick={() => setActiveMenu(null)}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span className="chip-dot" style={{ background: 'var(--blue)' }} />
                            <span className="mono bold">Saham Bluechip IDX</span>
                          </div>
                          <span className="tag mono" style={{ fontSize: '9px' }}>BBCA, BBRI, BREN</span>
                        </Link>

                        <Link href="/ringkasan?tab=emas" className="mega-asset-row" onClick={() => setActiveMenu(null)}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span className="chip-dot" style={{ background: 'var(--signal)' }} />
                            <span className="mono bold">Emas Fisik (Bullion)</span>
                          </div>
                          <span className="tag mono" style={{ fontSize: '9px' }}>XAUUSD, PAXG</span>
                        </Link>

                        <Link href="/ringkasan?tab=komoditi" className="mega-asset-row" onClick={() => setActiveMenu(null)}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span className="chip-dot" style={{ background: 'var(--red)' }} />
                            <span className="mono bold">Komoditi Energi</span>
                          </div>
                          <span className="tag mono" style={{ fontSize: '9px' }}>Minyak Brent, Gas</span>
                        </Link>
                      </div>
                    </div>

                    {/* Col 3: Radar Top Movers */}
                    <div className="mega-col mega-col-border">
                      <span className="mega-col-title mono">Radar Pergerakan 24 Jam</span>
                      <div className="mega-radar-box">
                        <div className="radar-subhead mono">🔥 TOP GAINERS</div>
                        <div className="radar-list">
                          {topGainers.map((g) => (
                            <Link
                              key={g.id}
                              href={`/ringkasan?symbol=${g.symbol}`}
                              className="radar-item"
                              onClick={() => setActiveMenu(null)}
                            >
                              <span className="mono bold">{g.symbol}</span>
                              <span className="mono trend-up">+{g.changePct?.toFixed(1)}%</span>
                            </Link>
                          ))}
                        </div>

                        <div className="radar-subhead mono" style={{ marginTop: '8px' }}>❄️ TOP LOSERS</div>
                        <div className="radar-list">
                          {topLosers.map((l) => (
                            <Link
                              key={l.id}
                              href={`/ringkasan?symbol=${l.symbol}`}
                              className="radar-item"
                              onClick={() => setActiveMenu(null)}
                            >
                              <span className="mono bold">{l.symbol}</span>
                              <span className="mono trend-down">{l.changePct?.toFixed(1)}%</span>
                            </Link>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Menu 2: Ruang Sidang 4 Agen AI */}
            <div
              className="nav-dropdown-trigger"
              onMouseEnter={() => handleMouseEnter('sidang')}
            >
              <button
                type="button"
                className={`nav-trigger-btn ${activeMenu === 'sidang' ? 'active' : ''}`}
                onClick={() => setActiveMenu(activeMenu === 'sidang' ? null : 'sidang')}
              >
                <IconScales size={14} />
                <span>Ruang Sidang AI</span>
                <span className="tag mono nav-badge" style={{ fontSize: '9px', padding: '1px 4px', color: 'var(--amber)' }}>
                  ZERO-HAL
                </span>
                <span className="nav-chevron">▾</span>
              </button>

              {activeMenu === 'sidang' && (
                <div className="mega-menu mega-menu-agents">
                  <div className="mega-agents-header">
                    <div>
                      <span className="mono bold" style={{ fontSize: '11px', color: 'var(--amber)' }}>
                        DIALEKTIKA 4 AGEN SPESIALIS (ZERO HALLUCINATION ARCHITECTURE)
                      </span>
                      <div className="mono" style={{ fontSize: '10px', color: 'var(--ink-mute)', marginTop: '2px' }}>
                        Hak Veto Pengawas Risiko Memastikan Proteksi Modal Sebelum Alokasi
                      </div>
                    </div>
                    <span className="tag mono" style={{ fontSize: '9px' }}>4 AGENTS</span>
                  </div>

                  <div className="mega-agents-grid">
                    <div className="mega-agent-item">
                      <div className="agent-badge-pill" style={{ color: 'var(--blue)' }}>
                        <IconCandles size={13} />
                        <span>Fakta Terukur</span>
                      </div>
                      <div className="agent-title-text">Analis Data Kuantitatif</div>
                      <div className="agent-desc-text">Rasio volume 20v100, jarak SMA20/50/200, volatilitas, drawdown</div>
                    </div>

                    <div className="mega-agent-item">
                      <div className="agent-badge-pill" style={{ color: 'var(--green)' }}>
                        <IconTarget size={13} />
                        <span>Sudut Bull</span>
                      </div>
                      <div className="agent-title-text">Strateg Portofolio</div>
                      <div className="agent-desc-text">Tesis pertumbuhan asimetris, momentum tren &amp; horizon posisi</div>
                    </div>

                    <div className="mega-agent-item">
                      <div className="agent-badge-pill" style={{ color: 'var(--red)' }}>
                        <IconShield size={13} />
                        <span>Sudut Bear (Veto)</span>
                      </div>
                      <div className="agent-title-text">Pengawas Risiko</div>
                      <div className="agent-desc-text">Batas koreksi, stop-loss wajib &amp; hak veto deadlock modal</div>
                    </div>

                    <div className="mega-agent-item">
                      <div className="agent-badge-pill" style={{ color: 'var(--amber)' }}>
                        <IconScales size={13} />
                        <span>Putusan Terikat</span>
                      </div>
                      <div className="agent-title-text">Ketua Komite</div>
                      <div className="agent-desc-text">Beli, Tahan, Jual, atau Abstain dengan skor keyakinan bukti %</div>
                    </div>
                  </div>

                  {/* Deliberation Highlight Card */}
                  <div className="mega-deliberation-preview">
                    <div className="preview-status-pill mono">
                      <span className="badge-live-pulse" style={{ width: '5px', height: '5px' }} />
                      <span>PUTUSAN TERAKHIR: BTCUSDT</span>
                      <span className="tag mono" style={{ background: 'rgba(245,158,11,0.2)', color: 'var(--amber)', fontSize: '9px' }}>
                        ABSTAIN · 25% BUKTI
                      </span>
                    </div>
                    <p className="preview-text">
                      &ldquo;Deadlock: Pengawas Risiko memblokir tesis karena ruang koreksi -12,4% ke SMA200 melebihi toleransi risiko sedang.&rdquo;
                    </p>
                    <Link
                      href="/ringkasan?symbol=BTCUSDT"
                      className="btn btn-primary mono"
                      onClick={() => setActiveMenu(null)}
                      style={{ padding: '4px 10px', fontSize: '11px', textDecoration: 'none' }}
                    >
                      Buka Transkrip Lengkap &rarr;
                    </Link>
                  </div>
                </div>
              )}
            </div>

            {/* Menu 3: Warta & Intelijen Makro */}
            <div
              className="nav-dropdown-trigger"
              onMouseEnter={() => handleMouseEnter('intelijen')}
            >
              <button
                type="button"
                className={`nav-trigger-btn ${activeMenu === 'intelijen' ? 'active' : ''}`}
                onClick={() => setActiveMenu(activeMenu === 'intelijen' ? null : 'intelijen')}
              >
                <IconNews size={14} />
                <span>Warta &amp; Intelijen</span>
                <span className="tag mono nav-badge" style={{ fontSize: '9px', padding: '1px 4px' }}>
                  DAMPAK &ge;6
                </span>
                <span className="nav-chevron">▾</span>
              </button>

              {activeMenu === 'intelijen' && (
                <div className="mega-menu mega-menu-wide">
                  <div className="mega-menu-grid">
                    <div className="mega-col">
                      <span className="mega-col-title mono">Kurasi Dampak Harga Makro</span>
                      <Link href="/berita" className="mega-item" onClick={() => setActiveMenu(null)}>
                        <div className="mega-item-icon">
                          <IconNews size={16} />
                        </div>
                        <div>
                          <div className="mega-item-name">Indeks Warta Intelijen AI</div>
                          <div className="mega-item-desc">Semua laporan terstruktur dengan dampak harga riil (Skor &ge; 6/10)</div>
                        </div>
                      </Link>

                      <Link href="/berita?kategori=geopolitik" className="mega-item" onClick={() => setActiveMenu(null)}>
                        <div className="mega-item-icon" style={{ color: 'var(--amber)' }}>
                          <IconShield size={16} />
                        </div>
                        <div>
                          <div className="mega-item-name">Geopolitik &amp; Perang Global</div>
                          <div className="mega-item-desc">Disrupsi jalur maritim, Selat Hormuz &amp; lonjakan harga minyak mentah</div>
                        </div>
                      </Link>

                      <Link href="/berita?kategori=komoditi-emas" className="mega-item" onClick={() => setActiveMenu(null)}>
                        <div className="mega-item-icon" style={{ color: 'var(--signal)' }}>
                          <IconTarget size={16} />
                        </div>
                        <div>
                          <div className="mega-item-name">Komoditi Emas &amp; Valuta</div>
                          <div className="mega-item-desc">Akumulasi emas bank sentral global &amp; volatilitas kurs USD/IDR</div>
                        </div>
                      </Link>
                    </div>

                    <div className="mega-col mega-col-border">
                      <span className="mega-col-title mono">Warta Pilihan Utama</span>
                      <div className="mega-news-featured">
                        <div className="news-featured-tag mono">
                          <span>GEOPOLITIK</span>
                          <span style={{ color: 'var(--amber)' }}>DAMPAK: 9/10</span>
                        </div>
                        <h4 className="news-featured-title">
                          Eskalasi Geopolitik Selat Hormuz: Dampak Pasokan Minyak &amp; Reli Emas
                        </h4>
                        <p className="news-featured-desc">
                          Analisis kuantitatif dampak penutupan jalur tanker terhadap kontrak Brent crude dan lonjakan premi lindung nilai emas batangan.
                        </p>
                        <Link
                          href="/berita/geopolitik-minyak-mentah-emas-2026"
                          className="news-featured-link mono"
                          onClick={() => setActiveMenu(null)}
                        >
                          Baca Intelijen Lengkap &rarr;
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Menu 4: Mesin Kuantitatif */}
            <div
              className="nav-dropdown-trigger"
              onMouseEnter={() => handleMouseEnter('mesin')}
            >
              <button
                type="button"
                className={`nav-trigger-btn ${activeMenu === 'mesin' ? 'active' : ''}`}
                onClick={() => setActiveMenu(activeMenu === 'mesin' ? null : 'mesin')}
              >
                <IconFlow size={14} />
                <span>Mesin Analitik</span>
                <span className="nav-chevron">▾</span>
              </button>

              {activeMenu === 'mesin' && (
                <div className="mega-menu mega-menu-wide">
                  <div className="mega-menu-grid">
                    <div className="mega-col">
                      <span className="mega-col-title mono">Infrastruktur &amp; Validasi</span>
                      <Link href="/backtest" className="mega-item" onClick={() => setActiveMenu(null)}>
                        <div className="mega-item-icon">
                          <IconCandles size={16} />
                        </div>
                        <div>
                          <div className="mega-item-name">Laboratorium Backtest</div>
                          <div className="mega-item-desc">Uji historis multi-horizon tanpa survivorship bias (30H, 90H, 180H)</div>
                        </div>
                      </Link>

                      <Link href="/pipeline" className="mega-item" onClick={() => setActiveMenu(null)}>
                        <div className="mega-item-icon">
                          <IconFlow size={16} />
                        </div>
                        <div>
                          <div className="mega-item-name">Pipeline &amp; Ingesti Data</div>
                          <div className="mega-item-desc">Status kesehatan adaptor bursa, antrean QStash, Redis &amp; DB Postgres</div>
                        </div>
                      </Link>
                    </div>

                    <div className="mega-col mega-col-border">
                      <span className="mega-col-title mono">Status Adaptor Bursa</span>
                      <div className="mega-engine-status mono">
                        <div className="engine-status-row">
                          <span className="status-name">Binance Spot API</span>
                          <span className="status-badge-ok">● TERHUBUNG</span>
                        </div>
                        <div className="engine-status-row">
                          <span className="status-name">Yahoo Finance Engine</span>
                          <span className="status-badge-ok">● TERHUBUNG</span>
                        </div>
                        <div className="engine-status-row">
                          <span className="status-name">IDX GoAPI Feeder</span>
                          <span className="status-badge-ok">● AKTIF</span>
                        </div>
                        <div className="engine-status-row">
                          <span className="status-name">Zero-Hal Engine</span>
                          <span className="status-badge-ok" style={{ color: 'var(--amber)' }}>● TERKUNCI v2.4</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </nav>

          {/* Integrated Search Input Trigger in Navbar */}
          <div className="landing-search-trigger">
            <button
              type="button"
              className="navbar-search-btn"
              onClick={() => setSearchOpen(true)}
              title="Cari 448 Instrumen Keuangan (Tekan ⌘K atau /)"
            >
              <IconSearch size={14} />
              <span className="search-placeholder">Cari 448 aset (BTC, BBCA, Emas...)...</span>
              <kbd className="search-kbd mono">⌘K</kbd>
            </button>
          </div>

          {/* Action Buttons Right Dock */}
          <div className="landing-nav-actions">
            <Link
              href="/ringkasan"
              className="btn btn-primary landing-action-btn"
              title="Masuk ke Terminal Komite"
            >
              <span className="badge-live-pulse" style={{ width: '6px', height: '6px' }} />
              <IconGauge size={14} />
              <span>Masuk Terminal</span>
              <IconArrowRight size={13} />
            </Link>

            <Link
              href="/admin"
              className="btn btn-quiet landing-admin-btn"
              title="Portal Khusus Administrator"
            >
              <IconLock size={13} />
              <span className="admin-btn-label">Admin</span>
            </Link>

            {/* Mobile Menu Hamburger Toggle */}
            <button
              type="button"
              className="landing-hamburger-btn"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label="Menu Navigasi Mobile"
            >
              {mobileOpen ? <IconClose size={18} /> : <IconMenu size={18} />}
            </button>
          </div>
        </div>

        {/* 3. QUICK NAVIGATION STRIP (Pita Akses Cepat Bawah Header) */}
        <div className="landing-subnav-strip">
          <div className="landing-subnav-container">
            <div className="subnav-left-group">
              <span className="subnav-label mono">PINTASAN CEPAT:</span>
              <div className="subnav-scrollable hide-scroll">
                <Link href="/ringkasan" className="subnav-chip mono">
                  <IconGauge size={12} />
                  <span>Semua Deliberasi ({instruments.length || 448})</span>
                </Link>
                <Link href="/ringkasan?tab=crypto" className="subnav-chip mono">
                  <span className="chip-dot" style={{ background: 'var(--amber)' }} />
                  <span>Kripto (BTC, ETH, SOL)</span>
                </Link>
                <Link href="/ringkasan?tab=saham" className="subnav-chip mono">
                  <span className="chip-dot" style={{ background: 'var(--blue)' }} />
                  <span>Saham IDX (BBCA, BBRI, BREN)</span>
                </Link>
                <Link href="/ringkasan?tab=emas" className="subnav-chip mono">
                  <span className="chip-dot" style={{ background: 'var(--signal)' }} />
                  <span>Emas &amp; Logam (XAUUSD)</span>
                </Link>
                <Link href="/ringkasan?tab=veto" className="subnav-chip mono" style={{ borderColor: 'rgba(239,68,68,0.4)' }}>
                  <IconShield size={12} style={{ color: 'var(--red)' }} />
                  <span style={{ color: 'var(--red)' }}>Sinyal Veto Aktif</span>
                </Link>
                <Link href="/berita" className="subnav-chip mono">
                  <IconNews size={12} />
                  <span>Warta Makro &amp; Perang</span>
                </Link>
                <Link href="/backtest" className="subnav-chip mono">
                  <IconCandles size={12} />
                  <span>Laboratorium Backtest</span>
                </Link>
                <Link href="/pipeline" className="subnav-chip mono">
                  <IconFlow size={12} />
                  <span>Status Pipeline</span>
                </Link>
                <Link href="/admin" className="subnav-chip mono" style={{ borderColor: 'var(--line-strong)' }}>
                  <IconLock size={12} />
                  <span>Portal Admin</span>
                </Link>
              </div>
            </div>

            {/* Right side: Committee Sentiment Breadth Bar */}
            <div className="subnav-right-meter mono">
              <span style={{ color: 'var(--ink-faint)', fontSize: '10px' }}>TENSI PASAR:</span>
              <span className="trend-up" style={{ fontSize: '10px' }}>54% BULL</span>
              <div className="mini-meter-track">
                <div className="mini-meter-bull" style={{ width: '54%' }} />
                <div className="mini-meter-bear" style={{ width: '46%' }} />
              </div>
              <span className="trend-down" style={{ fontSize: '10px' }}>46% BEAR</span>
            </div>
          </div>
        </div>
      </header>

      {/* 4. COMMAND SEARCH PALETTE MODAL (⌘K) */}
      {searchOpen && (
        <div className="command-palette-backdrop" onClick={closeSearch}>
          <div
            className="command-palette-card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Pencarian Instrumen Komite"
          >
            {/* Search Input Bar */}
            <div className="command-input-row">
              <IconSearch size={18} style={{ color: 'var(--signal)', flexShrink: 0 }} />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Ketik simbol aset (BTC, BBCA, ETH, XAUUSD...) atau nama..."
                className="command-input mono"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="command-clear-btn"
                >
                  <IconClose size={14} />
                </button>
              )}
              <kbd className="command-esc-badge mono">ESC</kbd>
            </div>

            {/* Category Filter Pills */}
            <div className="command-filter-row mono">
              <button
                type="button"
                className={`filter-btn ${searchFilter === 'all' ? 'active' : ''}`}
                onClick={() => setSearchFilter('all')}
              >
                Semua Aset
              </button>
              <button
                type="button"
                className={`filter-btn ${searchFilter === 'crypto' ? 'active' : ''}`}
                onClick={() => setSearchFilter('crypto')}
              >
                Kripto
              </button>
              <button
                type="button"
                className={`filter-btn ${searchFilter === 'saham' ? 'active' : ''}`}
                onClick={() => setSearchFilter('saham')}
              >
                Saham IDX
              </button>
              <button
                type="button"
                className={`filter-btn ${searchFilter === 'komoditi' ? 'active' : ''}`}
                onClick={() => setSearchFilter('komoditi')}
              >
                Komoditi &amp; Emas
              </button>
            </div>

            {/* Search Results List */}
            <div className="command-results-scroll hide-scroll">
              {searchResults.map((item) => {
                const isPositive = (item.changePct ?? 0) >= 0
                return (
                  <Link
                    key={item.id}
                    href={`/ringkasan?symbol=${item.symbol}`}
                    className="command-result-item"
                    onClick={() => setSearchOpen(false)}
                  >
                    <div className="result-left">
                      <AssetIcon symbol={item.symbol} size={20} />
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span className="mono bold" style={{ fontSize: '13px', color: 'var(--ink)' }}>
                            {item.symbol}
                          </span>
                          <span className="tag mono" style={{ fontSize: '9px' }}>
                            {item.assetClass}
                          </span>
                          <span className="mono" style={{ fontSize: '10px', color: 'var(--ink-faint)' }}>
                            {item.market}
                          </span>
                        </div>
                        <div className="result-name">{item.name}</div>
                      </div>
                    </div>

                    <div className="result-right mono">
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>
                        {item.lastClose
                          ? (item.assetClass === 'saham' ? 'Rp' : '$') +
                            Number(item.lastClose).toLocaleString('id-ID')
                          : '-'}
                      </div>
                      <div className={`result-change ${isPositive ? 'trend-up' : 'trend-down'}`}>
                        {isPositive ? '+' : ''}
                        {item.changePct ? item.changePct.toFixed(2) + '%' : '0.00%'}
                      </div>
                    </div>
                  </Link>
                )
              })}

              {searchResults.length === 0 && (
                <div className="command-empty mono">
                  <IconSearch size={24} style={{ opacity: 0.4 }} />
                  <div>Tidak ditemukan instrumen dengan kata kunci &ldquo;{searchQuery}&rdquo;</div>
                  <div style={{ fontSize: '11px', color: 'var(--ink-faint)', marginTop: '4px' }}>
                    Coba cari simbol lain seperti BTC, ETH, BBCA, BREN, atau XAUUSD.
                  </div>
                </div>
              )}
            </div>

            {/* Command Palette Footer */}
            <div className="command-palette-foot mono">
              <span>Navigasi instrumen kuantitatif tanpa jeda</span>
              <div style={{ display: 'flex', gap: '12px' }}>
                <Link href="/ringkasan" onClick={() => setSearchOpen(false)} className="foot-quick-link">
                  Terminal Deliberasi &rarr;
                </Link>
                <Link href="/berita" onClick={() => setSearchOpen(false)} className="foot-quick-link">
                  Warta Intelijen &rarr;
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. MOBILE DRAWER OVERLAY & MENU */}
      {mobileOpen && (
        <>
          <div
            className="landing-mobile-backdrop"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside className="landing-mobile-drawer">
            <div className="mobile-drawer-head">
              <div className="landing-brand">
                <span className="mark-glyph">
                  <IconPulse size={16} />
                </span>
                <span className="mark-name">Komite</span>
                <span className="mark-phase">PRO v2.4</span>
              </div>
              <button
                type="button"
                className="btn-icon"
                onClick={() => setMobileOpen(false)}
                aria-label="Tutup Menu"
              >
                <IconClose size={18} />
              </button>
            </div>

            {/* Mobile Quick Search Button */}
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)' }}>
              <button
                type="button"
                className="navbar-search-btn"
                style={{ width: '100%', justifyContent: 'space-between' }}
                onClick={() => {
                  setMobileOpen(false)
                  setSearchOpen(true)
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <IconSearch size={14} />
                  <span>Cari instrumen...</span>
                </div>
                <kbd className="search-kbd mono">⌘K</kbd>
              </button>
            </div>

            <div className="mobile-drawer-body">
              {/* Section: Terminal & Pasar */}
              <div className="mobile-menu-section">
                <div className="mobile-menu-title mono">PASAR &amp; INSTRUMEN</div>
                <Link
                  href="/ringkasan"
                  className="mobile-menu-link"
                  onClick={() => setMobileOpen(false)}
                >
                  <IconGauge size={16} />
                  <span>Ringkasan Pasar &amp; Deliberasi</span>
                </Link>
                <Link
                  href="/instruments"
                  className="mobile-menu-link"
                  onClick={() => setMobileOpen(false)}
                >
                  <IconRows size={16} />
                  <span>Katalog 448 Instrumen</span>
                </Link>
                <Link
                  href="/ringkasan?tab=crypto"
                  className="mobile-menu-link sub-link mono"
                  onClick={() => setMobileOpen(false)}
                >
                  <span>&bull; Kripto &amp; Meme (BTC, ETH, SOL)</span>
                </Link>
                <Link
                  href="/ringkasan?tab=saham"
                  className="mobile-menu-link sub-link mono"
                  onClick={() => setMobileOpen(false)}
                >
                  <span>&bull; Saham IDX (BBCA, BBRI, BREN)</span>
                </Link>
                <Link
                  href="/ringkasan?tab=emas"
                  className="mobile-menu-link sub-link mono"
                  onClick={() => setMobileOpen(false)}
                >
                  <span>&bull; Emas &amp; Logam Mulia (XAUUSD)</span>
                </Link>
              </div>

              {/* Section: 4 Agen Spesialis */}
              <div className="mobile-menu-section">
                <div className="mobile-menu-title mono">RUANG SIDANG 4 AGEN</div>
                <div className="mobile-agents-preview">
                  <div className="mobile-agent-chip mono" style={{ color: 'var(--blue)' }}>
                    <IconCandles size={12} />
                    <span>Analis Data</span>
                  </div>
                  <div className="mobile-agent-chip mono" style={{ color: 'var(--green)' }}>
                    <IconTarget size={12} />
                    <span>Strateg Bull</span>
                  </div>
                  <div className="mobile-agent-chip mono" style={{ color: 'var(--red)' }}>
                    <IconShield size={12} />
                    <span>Pengawas Risiko</span>
                  </div>
                  <div className="mobile-agent-chip mono" style={{ color: 'var(--amber)' }}>
                    <IconScales size={12} />
                    <span>Ketua Komite</span>
                  </div>
                </div>
              </div>

              {/* Section: Warta Makro & Mesin */}
              <div className="mobile-menu-section">
                <div className="mobile-menu-title mono">INTELIJEN &amp; INFRASTRUKTUR</div>
                <Link
                  href="/berita"
                  className="mobile-menu-link"
                  onClick={() => setMobileOpen(false)}
                >
                  <IconNews size={16} />
                  <span>Warta Intelijen AI (Dampak &ge; 6)</span>
                </Link>
                <Link
                  href="/backtest"
                  className="mobile-menu-link"
                  onClick={() => setMobileOpen(false)}
                >
                  <IconCandles size={16} />
                  <span>Laboratorium Backtest</span>
                </Link>
                <Link
                  href="/pipeline"
                  className="mobile-menu-link"
                  onClick={() => setMobileOpen(false)}
                >
                  <IconFlow size={16} />
                  <span>Pipeline &amp; Database</span>
                </Link>
              </div>

              {/* Section: Administrasi */}
              <div className="mobile-menu-section">
                <div className="mobile-menu-title mono">ADMINISTRATOR</div>
                <Link
                  href="/admin"
                  className="mobile-menu-link"
                  onClick={() => setMobileOpen(false)}
                >
                  <IconLock size={16} />
                  <span>Portal Admin Komite</span>
                </Link>
              </div>
            </div>

            <div className="mobile-drawer-foot">
              <Link
                href="/ringkasan"
                className="btn btn-primary btn-block"
                onClick={() => setMobileOpen(false)}
              >
                <IconGauge size={16} />
                <span>Buka Terminal Pasar</span>
                <IconArrowRight size={14} />
              </Link>
            </div>
          </aside>
        </>
      )}
    </>
  )
}
