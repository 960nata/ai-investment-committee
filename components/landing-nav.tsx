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
  IconTrendUp,
  IconTrendDown,
} from '@/components/icons'
import { AssetIcon } from '@/components/asset-icons'
import type { InstrumentQuote } from '@/lib/db/queries'

interface LandingNavProps {
  instruments?: InstrumentQuote[]
  topAssets?: InstrumentQuote[]
  latestNews?: Array<{
    id: number | string
    title: string
    slug: string
    category?: string
    impactScore?: number
  }>
  freshnessLabel?: string
  isFresh?: boolean
  isAdmin?: boolean
}

export function LandingNav({
  instruments = [],
  topAssets = [],
  latestNews = [],
  isAdmin = false,
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

  // Ticker items across multiple asset classes (Crypto, Saham IDX, Emas, Komoditi)
  const multiAssetTickers = useMemo(() => {
    const list: { category: string; asset: InstrumentQuote }[] = []

    // 1. Kripto
    const cryptos = instruments.filter(
      (i) => i.assetClass === 'crypto' || i.assetClass === 'memecoin',
    )
    const btc = cryptos.find((i) => i.symbol === 'BTCUSDT') || cryptos[0]
    const eth = cryptos.find((i) => i.symbol === 'ETHUSDT') || cryptos[1]
    const sol = cryptos.find((i) => i.symbol === 'SOLUSDT') || cryptos[2]
    if (btc) list.push({ category: 'KRIPTO', asset: btc })
    if (eth) list.push({ category: 'KRIPTO', asset: eth })
    if (sol) list.push({ category: 'KRIPTO', asset: sol })

    // 2. Saham IDX
    const stocks = instruments.filter((i) => i.assetClass === 'saham')
    const bbca = stocks.find((i) => i.symbol.includes('BBCA')) || stocks[0]
    const bbri = stocks.find((i) => i.symbol.includes('BBRI')) || stocks[1]
    const bren = stocks.find((i) => i.symbol.includes('BREN') || i.symbol.includes('TLKM')) || stocks[2]
    if (bbca) list.push({ category: 'SAHAM', asset: bbca })
    if (bbri) list.push({ category: 'SAHAM', asset: bbri })
    if (bren) list.push({ category: 'SAHAM', asset: bren })

    // 3. Emas & Logam Mulia
    const metals = instruments.filter((i) => i.assetClass === 'emas')
    const emas = metals.find((i) => i.symbol === 'PAXGUSDT' || i.symbol === 'GC=F' || i.symbol === 'XAUUSD') || metals[0]
    if (emas) list.push({ category: 'EMAS', asset: emas })

    // 4. Komoditas (Minyak, Gas, Nikel)
    const commodities = instruments.filter((i) => i.assetClass === 'komoditi')
    const oil = commodities.find((i) => i.symbol.includes('BZ') || i.symbol.includes('CL')) || commodities[0]
    if (oil) list.push({ category: 'KOMODITI', asset: oil })

    // Fallback if DB list is small
    if (list.length < 4 && topAssets.length > 0) {
      topAssets.forEach((ta) => {
        if (!list.some((item) => item.asset.symbol === ta.symbol)) {
          list.push({ category: ta.assetClass.toUpperCase(), asset: ta })
        }
      })
    }

    return list
  }, [instruments, topAssets])

  // Headline berita terkini untuk subbar
  const latestNewsHeadline = useMemo(() => {
    if (latestNews && latestNews.length > 0) {
      return latestNews[0]
    }
    return null
  }, [latestNews])

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
      {/* 1. MAIN NAVIGATION HEADER */}
      <header className="landing-header">
        <div className="landing-nav-container">
          {/* Brand Logo */}
          <Link href="/" className="landing-brand">
            <span className="mark-glyph">
              <IconPulse size={16} />
            </span>
            <span className="mark-name">Komite</span>
          </Link>

          {/* Center Navigation Links with Friendly Mega Dropdowns */}
          <nav className="landing-nav-links" onMouseLeave={handleMouseLeave}>
            {/* Menu 1: Pasar */}
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
                <span>Pasar</span>
                <span className="nav-chevron">▾</span>
              </button>

              {activeMenu === 'pasar' && (
                <div className="mega-menu mega-menu-wide-3col">
                  <div className="mega-menu-grid-3col">
                    {/* Col 1: Menu Pasar */}
                    <div className="mega-col">
                      <span className="mega-col-title mono">Pusat Pasar</span>
                      <Link href="/ringkasan" className="mega-item" onClick={() => setActiveMenu(null)}>
                        <div className="mega-item-icon">
                          <IconGauge size={16} />
                        </div>
                        <div>
                          <div className="mega-item-name">Ringkasan Pasar</div>
                          <div className="mega-item-desc">Grafik harga harian, tren pasar, dan evaluasi 4 AI</div>
                        </div>
                      </Link>

                      <Link href="/instruments" className="mega-item" onClick={() => setActiveMenu(null)}>
                        <div className="mega-item-icon">
                          <IconRows size={16} />
                        </div>
                        <div>
                          <div className="mega-item-name">Daftar Aset Lengkap</div>
                          <div className="mega-item-desc">Kripto, saham IDX, emas, dan komoditas global</div>
                        </div>
                      </Link>

                      <Link href="/ringkasan?tab=veto" className="mega-item" onClick={() => setActiveMenu(null)}>
                        <div className="mega-item-icon" style={{ color: 'var(--red)' }}>
                          <IconShield size={16} />
                        </div>
                        <div>
                          <div className="mega-item-name">Peringatan Risiko</div>
                          <div className="mega-item-desc">Aset rawan koreksi dan mendapat sinyal penahanan risiko</div>
                        </div>
                      </Link>
                    </div>

                    {/* Col 2: Kategori Pilihan */}
                    <div className="mega-col mega-col-border">
                      <span className="mega-col-title mono">Kategori Pilihan</span>
                      <div className="mega-asset-list">
                        <Link href="/ringkasan?tab=crypto" className="mega-asset-row" onClick={() => setActiveMenu(null)}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span className="chip-dot" style={{ background: 'var(--amber)' }} />
                            <span className="mono bold">Kripto Populer</span>
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
                            <span className="mono bold">Emas &amp; Logam Mulia</span>
                          </div>
                          <span className="tag mono" style={{ fontSize: '9px' }}>XAUUSD, PAXG</span>
                        </Link>

                        <Link href="/ringkasan?tab=komoditi" className="mega-asset-row" onClick={() => setActiveMenu(null)}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span className="chip-dot" style={{ background: 'var(--red)' }} />
                            <span className="mono bold">Komoditas Energi</span>
                          </div>
                          <span className="tag mono" style={{ fontSize: '9px' }}>Minyak Brent, Gas</span>
                        </Link>
                      </div>
                    </div>

                    {/* Col 3: Radar Top Movers */}
                    <div className="mega-col mega-col-border">
                      <span className="mega-col-title mono">Pergerakan 24 Jam</span>
                      <div className="mega-radar-box">
                        <div className="radar-subhead mono" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <IconTrendUp size={12} style={{ color: 'var(--green)' }} />
                          <span>TOP NAIK</span>
                        </div>
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

                        <div className="radar-subhead mono" style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <IconTrendDown size={12} style={{ color: 'var(--red)' }} />
                          <span>TOP TURUN</span>
                        </div>
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

            {/* Menu 2: Sidang AI */}
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
                <span>Sidang AI</span>
                <span className="nav-chevron">▾</span>
              </button>

              {activeMenu === 'sidang' && (
                <div className="mega-menu mega-menu-agents">
                  <div className="mega-agents-header">
                    <div>
                      <span className="mono bold" style={{ fontSize: '11px', color: 'var(--amber)' }}>
                        4 ASISTEN AI ANALISIS ASET
                      </span>
                      <div className="mono" style={{ fontSize: '10px', color: 'var(--ink-mute)', marginTop: '2px' }}>
                        Setiap AI memiliki peran khusus untuk menilai potensi keuntungan dan mencegah risiko kerugian
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
                      <div className="agent-title-text">Analis Data</div>
                      <div className="agent-desc-text">Membaca data grafik, pergerakan tren harga, dan volume perdagangan</div>
                    </div>

                    <div className="mega-agent-item">
                      <div className="agent-badge-pill" style={{ color: 'var(--green)' }}>
                        <IconTarget size={13} />
                        <span>Peluang Profit</span>
                      </div>
                      <div className="agent-title-text">Ahli Peluang (Bull)</div>
                      <div className="agent-desc-text">Mencari potensi kenaikan harga dan momentum pembelian terbaik</div>
                    </div>

                    <div className="mega-agent-item">
                      <div className="agent-badge-pill" style={{ color: 'var(--red)' }}>
                        <IconShield size={13} />
                        <span>Proteksi Modal</span>
                      </div>
                      <div className="agent-title-text">Pengawas Risiko</div>
                      <div className="agent-desc-text">Memasang batas aman kerugian dan melindungi modal dari kejatuhan harga</div>
                    </div>

                    <div className="mega-agent-item">
                      <div className="agent-badge-pill" style={{ color: 'var(--amber)' }}>
                        <IconScales size={13} />
                        <span>Putusan Terikat</span>
                      </div>
                      <div className="agent-title-text">Ketua Komite</div>
                      <div className="agent-desc-text">Merangkum putusan akhir: Beli, Tahan, atau Hindari dengan skor bukti</div>
                    </div>
                  </div>

                  {/* Deliberation Highlight Card */}
                  <div className="mega-deliberation-preview">
                    <div className="preview-status-pill mono">
                      <span className="badge-live-pulse" style={{ width: '5px', height: '5px' }} />
                      <span>CONTOH PUTUSAN: BTCUSDT</span>
                      <span className="tag mono" style={{ background: 'rgba(245,158,11,0.2)', color: 'var(--amber)', fontSize: '9px' }}>
                        TAHAN / HINDARI
                      </span>
                    </div>
                    <p className="preview-text">
                      &ldquo;Pengawas Risiko memblokir pembelian agresif karena potensi koreksi harga melebihi batas aman.&rdquo;
                    </p>
                    <Link
                      href="/ringkasan?symbol=BTCUSDT"
                      className="btn btn-primary mono"
                      onClick={() => setActiveMenu(null)}
                      style={{ padding: '4px 10px', fontSize: '11px', textDecoration: 'none' }}
                    >
                      Buka Terminal Analisis &rarr;
                    </Link>
                  </div>
                </div>
              )}
            </div>

            {/* Menu 3: Berita */}
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
                <span>Berita</span>
                <span className="nav-chevron">▾</span>
              </button>

              {activeMenu === 'intelijen' && (
                <div className="mega-menu mega-menu-wide">
                  <div className="mega-menu-grid">
                    <div className="mega-col">
                      <span className="mega-col-title mono">Kategori Berita</span>
                      <Link href="/berita" className="mega-item" onClick={() => setActiveMenu(null)}>
                        <div className="mega-item-icon">
                          <IconNews size={16} />
                        </div>
                        <div>
                          <div className="mega-item-name">Kabar Pasar &amp; Ekonomi</div>
                          <div className="mega-item-desc">Berita terkini yang berdampak langsung ke pergerakan harga aset</div>
                        </div>
                      </Link>

                      <Link href="/berita?kategori=geopolitik" className="mega-item" onClick={() => setActiveMenu(null)}>
                        <div className="mega-item-icon" style={{ color: 'var(--amber)' }}>
                          <IconShield size={16} />
                        </div>
                        <div>
                          <div className="mega-item-name">Isu Perang &amp; Minyak Dunia</div>
                          <div className="mega-item-desc">Dampak konflik global terhadap pasokan energi dan harga komoditas</div>
                        </div>
                      </Link>

                      <Link href="/berita?kategori=komoditi-emas" className="mega-item" onClick={() => setActiveMenu(null)}>
                        <div className="mega-item-icon" style={{ color: 'var(--signal)' }}>
                          <IconTarget size={16} />
                        </div>
                        <div>
                          <div className="mega-item-name">Emas &amp; Nilai Tukar Rupiah</div>
                          <div className="mega-item-desc">Pantau kurs mata uang, inflasi global, dan tren harga emas fisik</div>
                        </div>
                      </Link>
                    </div>

                    <div className="mega-col mega-col-border">
                      <span className="mega-col-title mono">Berita Pilihan Hari Ini</span>
                      <div className="mega-news-featured">
                        <div className="news-featured-tag mono">
                          <span>GEOPOLITIK</span>
                          <span style={{ color: 'var(--amber)' }}>PENTING</span>
                        </div>
                        <h4 className="news-featured-title">
                          Eskalasi Geopolitik Selat Hormuz: Dampak Pasokan Minyak &amp; Reli Emas
                        </h4>
                        <p className="news-featured-desc">
                          Analisis pergerakan kontrak minyak mentah dunia dan lonjakan permintaan lindung nilai emas batangan.
                        </p>
                        <Link
                          href="/berita/geopolitik-minyak-mentah-emas-2026"
                          className="news-featured-link mono"
                          onClick={() => setActiveMenu(null)}
                        >
                          Baca Berita Lengkap &rarr;
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Menu 4: Riset */}
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
                <span>Riset</span>
                <span className="nav-chevron">▾</span>
              </button>

              {activeMenu === 'mesin' && (
                <div className="mega-menu mega-menu-wide">
                  <div className="mega-menu-grid">
                    <div className="mega-col">
                      <span className="mega-col-title mono">Fitur Riset</span>
                      <Link href="/backtest" className="mega-item" onClick={() => setActiveMenu(null)}>
                        <div className="mega-item-icon">
                          <IconCandles size={16} />
                        </div>
                        <div>
                          <div className="mega-item-name">Uji Strategi (Backtest)</div>
                          <div className="mega-item-desc">Cek performa sinyal AI berdasarkan pergerakan data masa lalu</div>
                        </div>
                      </Link>

                      <Link href="/pipeline" className="mega-item" onClick={() => setActiveMenu(null)}>
                        <div className="mega-item-icon">
                          <IconFlow size={16} />
                        </div>
                        <div>
                          <div className="mega-item-name">Koneksi Data Bursa</div>
                          <div className="mega-item-desc">Sumber data resmi bursa kripto, saham IDX, dan komoditi</div>
                        </div>
                      </Link>
                    </div>

                    <div className="mega-col mega-col-border">
                      <span className="mega-col-title mono">Status Koneksi Bursa</span>
                      <div className="mega-engine-status mono">
                        <div className="engine-status-row">
                          <span className="status-name">Binance Spot API (Kripto)</span>
                          <span className="status-badge-ok">● TERHUBUNG</span>
                        </div>
                        <div className="engine-status-row">
                          <span className="status-name">Bursa Efek Indonesia (IDX)</span>
                          <span className="status-badge-ok">● AKTIF</span>
                        </div>
                        <div className="engine-status-row">
                          <span className="status-name">Yahoo Finance (Emas &amp; Minyak)</span>
                          <span className="status-badge-ok">● AKTIF</span>
                        </div>
                        <div className="engine-status-row">
                          <span className="status-name">Mesin Evaluasi AI</span>
                          <span className="status-badge-ok" style={{ color: 'var(--amber)' }}>● SIAP</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </nav>

          {/* Integrated Search Trigger */}
          <div className="landing-search-trigger">
            <button
              type="button"
              className="navbar-search-btn"
              onClick={() => setSearchOpen(true)}
              title="Cari Aset (Tekan ⌘K atau /)"
            >
              <IconSearch size={14} />
              <span className="search-placeholder">Cari aset...</span>
              <kbd className="search-kbd mono">⌘K</kbd>
            </button>
          </div>

          {/* Action Buttons Right: Unified Login / Admin Switcher */}
          <div className="landing-nav-actions">
            {isAdmin ? (
              <>
                <Link
                  href="/admin"
                  className="btn btn-primary landing-action-btn"
                  style={{ background: 'var(--signal)', color: '#000', fontWeight: 600 }}
                  title="Buka Dashboard Administrator"
                >
                  <IconLock size={13} />
                  <span>Dashboard Admin</span>
                </Link>
                <Link
                  href="/ringkasan"
                  className="btn btn-quiet landing-action-btn"
                  title="Buka Terminal Pengguna"
                >
                  <IconGauge size={13} />
                  <span>Terminal User</span>
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="btn btn-quiet landing-action-btn"
                  title="Masuk ke Akun atau Akses Admin"
                >
                  <span>Masuk</span>
                </Link>
                <Link
                  href="/ringkasan"
                  className="btn btn-primary landing-action-btn"
                  title="Buka Terminal Komite"
                >
                  <span className="badge-live-pulse" style={{ width: '6px', height: '6px' }} />
                  <IconGauge size={14} />
                  <span>Buka Terminal</span>
                  <IconArrowRight size={13} />
                </Link>
              </>
            )}

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

        {/* 2. BARIS HARGA ASET & WARTA PASAR DI BAWAH NAVBAR */}
        <div className="landing-subnav-strip" suppressHydrationWarning>
          <div className="landing-subnav-container">
            {/* Berita Kecil / Warta Terkini */}
            <div className="subnav-news-group">
              <span className="news-pulse-tag mono">
                <span className="badge-live-pulse" style={{ width: '5px', height: '5px' }} />
                <span>WARTA</span>
              </span>
              {latestNewsHeadline ? (
                <Link
                  href={`/berita/${latestNewsHeadline.slug}`}
                  className="subnav-news-title"
                  title={latestNewsHeadline.title}
                >
                  {latestNewsHeadline.title}
                </Link>
              ) : (
                <Link href="/berita" className="subnav-news-title">
                  Pantau pergerakan harga 400+ aset kripto, saham IDX, emas, dan komoditas global
                </Link>
              )}
            </div>

            {/* Ticker Harga Lintas Aset: Kripto, Saham, Emas, Komoditi */}
            <div className="subnav-ticker-group">
              <div className="subnav-scrollable hide-scroll">
                {multiAssetTickers.map(({ category, asset }) => {
                  const isPositive = (asset.changePct ?? 0) >= 0
                  return (
                    <Link
                      key={asset.id}
                      href={`/ringkasan?symbol=${asset.symbol}`}
                      className="subnav-price-chip"
                      title={`${asset.name} (${asset.symbol})`}
                    >
                      <span className="subnav-cat-badge mono">{category}</span>
                      <AssetIcon symbol={asset.symbol} size={12} />
                      <span className="subnav-sym mono">{asset.symbol}</span>
                      <span className="subnav-price mono">
                        {asset.lastClose
                          ? (asset.assetClass === 'saham' ? 'Rp' : '$') +
                            Number(asset.lastClose).toLocaleString('id-ID')
                          : '-'}
                      </span>
                      <span className={`subnav-chg mono ${isPositive ? 'trend-up' : 'trend-down'}`}>
                        {isPositive ? '+' : ''}
                        {asset.changePct ? asset.changePct.toFixed(1) + '%' : '0.0%'}
                      </span>
                    </Link>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* 3. COMMAND SEARCH PALETTE MODAL (⌘K) */}
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
                Emas &amp; Komoditi
              </button>
            </div>

            {/* Live Search Results List */}
            <div className="command-results-list">
              {searchResults.length === 0 ? (
                <div className="command-empty mono">
                  Tidak ditemukan instrumen yang cocok dengan &ldquo;{searchQuery}&rdquo;.
                </div>
              ) : (
                searchResults.map((asset) => {
                  const isPositive = (asset.changePct ?? 0) >= 0
                  return (
                    <Link
                      key={asset.id}
                      href={`/ringkasan?symbol=${asset.symbol}`}
                      className="command-result-item"
                      onClick={closeSearch}
                    >
                      <div className="command-item-left">
                        <AssetIcon symbol={asset.symbol} size={22} />
                        <div>
                          <div className="command-item-symbol mono bold">{asset.symbol}</div>
                          <div className="command-item-name">{asset.name}</div>
                        </div>
                      </div>

                      <div className="command-item-right mono">
                        <span className="command-item-price">
                          {asset.lastClose
                            ? (asset.assetClass === 'saham' ? 'Rp' : '$') +
                              Number(asset.lastClose).toLocaleString('id-ID')
                            : '-'}
                        </span>
                        <span
                          className={`command-item-chg ${isPositive ? 'trend-up' : 'trend-down'}`}
                        >
                          {isPositive ? '+' : ''}
                          {asset.changePct ? asset.changePct.toFixed(1) + '%' : '0.0%'}
                        </span>
                        <span className="tag" style={{ fontSize: '9px', textTransform: 'uppercase' }}>
                          {asset.assetClass}
                        </span>
                      </div>
                    </Link>
                  )
                })
              )}
            </div>

            {/* Command Palette Footer */}
            <div className="command-palette-foot mono">
              <span>Navigasi instrumen kuantitatif tanpa jeda</span>
              <div style={{ display: 'flex', gap: '12px' }}>
                <Link href="/ringkasan" onClick={() => setSearchOpen(false)} className="foot-quick-link">
                  Terminal Pasar &rarr;
                </Link>
                <Link href="/berita" onClick={() => setSearchOpen(false)} className="foot-quick-link">
                  Warta Intelijen &rarr;
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. MOBILE DRAWER OVERLAY & MENU */}
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
                  <span>Cari aset...</span>
                </div>
                <kbd className="search-kbd mono">⌘K</kbd>
              </button>
            </div>

            <div className="mobile-drawer-body">
              {/* Section: Pasar */}
              <div className="mobile-menu-section">
                <div className="mobile-menu-title mono">PASAR</div>
                <Link
                  href="/ringkasan"
                  className="mobile-menu-link"
                  onClick={() => setMobileOpen(false)}
                >
                  <IconGauge size={16} />
                  <span>Ringkasan Pasar</span>
                </Link>
                <Link
                  href="/instruments"
                  className="mobile-menu-link"
                  onClick={() => setMobileOpen(false)}
                >
                  <IconRows size={16} />
                  <span>Katalog Aset Lengkap</span>
                </Link>
                <Link
                  href="/ringkasan?tab=crypto"
                  className="mobile-menu-link sub-link mono"
                  onClick={() => setMobileOpen(false)}
                >
                  <span>&bull; Kripto (BTC, ETH, SOL)</span>
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
                  <span>&bull; Emas &amp; Logam Mulia</span>
                </Link>
                <Link
                  href="/ringkasan?tab=komoditi"
                  className="mobile-menu-link sub-link mono"
                  onClick={() => setMobileOpen(false)}
                >
                  <span>&bull; Komoditas Global</span>
                </Link>
              </div>

              {/* Section: 4 Asisten AI */}
              <div className="mobile-menu-section">
                <div className="mobile-menu-title mono">SIDANG 4 AI</div>
                <div className="mobile-agents-preview">
                  <div className="mobile-agent-chip mono" style={{ color: 'var(--blue)' }}>
                    <IconCandles size={12} />
                    <span>Analis Data</span>
                  </div>
                  <div className="mobile-agent-chip mono" style={{ color: 'var(--green)' }}>
                    <IconTarget size={12} />
                    <span>Ahli Peluang</span>
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

              {/* Section: Berita & Riset */}
              <div className="mobile-menu-section">
                <div className="mobile-menu-title mono">BERITA &amp; RISET</div>
                <Link
                  href="/berita"
                  className="mobile-menu-link"
                  onClick={() => setMobileOpen(false)}
                >
                  <IconNews size={16} />
                  <span>Kabar Pasar &amp; Ekonomi</span>
                </Link>
                <Link
                  href="/backtest"
                  className="mobile-menu-link"
                  onClick={() => setMobileOpen(false)}
                >
                  <IconCandles size={16} />
                  <span>Uji Strategi AI (Backtest)</span>
                </Link>
                <Link
                  href="/pipeline"
                  className="mobile-menu-link"
                  onClick={() => setMobileOpen(false)}
                >
                  <IconFlow size={16} />
                  <span>Koneksi Data Bursa</span>
                </Link>
              </div>

              {/* Section: Sesi & Akun */}
              {isAdmin ? (
                <div className="mobile-menu-section">
                  <div className="mobile-menu-title mono">SESI ADMINISTRATOR</div>
                  <Link
                    href="/admin"
                    className="mobile-menu-link"
                    onClick={() => setMobileOpen(false)}
                    style={{ color: 'var(--signal)', fontWeight: 600 }}
                  >
                    <IconLock size={16} />
                    <span>Dashboard Admin</span>
                  </Link>
                  <Link
                    href="/ringkasan"
                    className="mobile-menu-link"
                    onClick={() => setMobileOpen(false)}
                  >
                    <IconGauge size={16} />
                    <span>Terminal User</span>
                  </Link>
                </div>
              ) : (
                <div className="mobile-menu-section">
                  <div className="mobile-menu-title mono">AKUN</div>
                  <Link
                    href="/login"
                    className="mobile-menu-link"
                    onClick={() => setMobileOpen(false)}
                  >
                    <IconLock size={16} />
                    <span>Masuk ke Akun</span>
                  </Link>
                </div>
              )}
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
