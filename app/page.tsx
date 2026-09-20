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
  IconArrowRight,
  IconLock,
  IconClock,
  IconTrendUp,
  IconTrendDown,
} from '@/components/icons'
import { listInstrumentQuotes, getDataFreshness, describeAge, type InstrumentQuote } from '@/lib/db/queries'
import { getMarketNewsList } from '@/lib/db/news-queries'
import { Lamp } from '@/components/ui'
import { AssetIcon } from '@/components/asset-icons'
import { verifyAdminSession } from '@/lib/auth/admin-auth'
import { LandingNav } from '@/components/landing-nav'
import { LandingDeliberationConsole } from '@/components/landing-deliberation-console'

export const dynamic = 'force-dynamic'

export default async function LandingPage() {
  const [instruments, latestNews, freshness, isAdmin] = await Promise.all([
    listInstrumentQuotes().catch(() => []),
    getMarketNewsList({ limit: 5, minImpact: 6 }).catch(() => []),
    getDataFreshness().catch(() => null),
    verifyAdminSession().catch(() => false),
  ])

  // Ambil aset-aset representatif untuk ticker lintas kategori (Kripto, Saham, Emas, Komoditas)
  const topAssets = [
    instruments.find((i) => i.symbol === 'BTCUSDT'),
    instruments.find((i) => i.symbol === 'ETHUSDT'),
    instruments.find((i) => i.symbol === 'SOLUSDT'),
    instruments.find((i) => i.symbol === 'BBCA' || i.symbol === 'BBRI'),
    instruments.find((i) => i.symbol === 'XAUUSD' || i.symbol === 'PAXGUSDT'),
    instruments.find((i) => i.symbol === 'BZ=F' || i.symbol === 'CL=F'),
  ].filter(Boolean) as InstrumentQuote[]

  const freshnessLabel = freshness?.freshness === 'fresh' ? 'DATA SEGAR · TERHUBUNG' : 'DATA TERCATAT'

  return (
    <div className="landing-shell">
      {/* Header Navigasi Publik (Menu Bersih, Ticker Lintas Aset & Warta Berita di Bawah Navbar) */}
      <LandingNav
        instruments={instruments}
        topAssets={topAssets}
        latestNews={latestNews}
        freshnessLabel={freshnessLabel}
        isFresh={freshness?.freshness === 'fresh'}
        isAdmin={isAdmin}
      />

      {/* Hero Section */}
      <section className="landing-hero">
        <div className="landing-hero-content">
          <div className="landing-badge">
            <span className="badge-live-pulse" />
            <span className="mono" style={{ fontSize: '11px', letterSpacing: '0.08em' }}>
              RUANG SIDANG AI · ZERO HALLUCINATION PROTOCOL
            </span>
          </div>

          <h1 className="landing-title">
            Komite Investasi Multi-Agen <br />
            <span style={{ color: 'var(--amber)' }}>Berbasis Data Kuantitatif Objektif</span>
          </h1>

          <p className="landing-lead">
            Perdebatan dialektika 4 agen AI spesialis di atas 448 instrumen keuangan: Kripto, Saham IDX,
            Emas, dan Komoditi Global. Tanpa opini kosong, murni kalkulasi matematis objektif dengan hak veto
            manajemen risiko.
          </p>

          <div className="landing-cta-row">
            <Link href="/ringkasan" className="btn btn-primary landing-btn-hero">
              <IconGauge size={16} />
              <span>Buka Terminal Komite</span>
              <IconArrowRight size={15} />
            </Link>
            <Link href="/berita" className="btn btn-quiet landing-btn-hero" style={{ border: '1px solid var(--line)' }}>
              <IconNews size={16} />
              <span>Warta Intelijen Makro</span>
            </Link>
          </div>

          {freshness && (
            <div className="landing-freshness mono">
              <Lamp state={freshness.freshness === 'fresh' ? 'ok' : 'halted'} />
              <span>
                Status Data: {freshness.freshness === 'fresh' ? 'Segar' : 'Basi'} ·{' '}
                {describeAge(freshness.ageMinutes)} · Basis Data Terverifikasi
              </span>
            </div>
          )}
        </div>
      </section>

      {/* Ticker Bar Kotak-Kotak */}
      {topAssets.length > 0 && (
        <section className="landing-ticker-section">
          <div className="landing-section-container">
            <div className="landing-ticker-grid">
              {topAssets.map((asset) => {
                if (!asset) return null
                const isPositive = (asset.changePct ?? 0) >= 0
                return (
                  <Link
                    key={asset.id}
                    href={`/ringkasan?symbol=${asset.symbol}`}
                    className="landing-ticker-card"
                  >
                    <div className="ticker-card-head">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <AssetIcon symbol={asset.symbol} size={18} />
                        <span className="mono bold" style={{ fontSize: '13px' }}>
                          {asset.symbol}
                        </span>
                      </div>
                      <span className="tag mono" style={{ fontSize: '9px', padding: '2px 4px' }}>
                        {asset.assetClass}
                      </span>
                    </div>
                    <div className="ticker-card-body">
                      <div className="mono bold" style={{ fontSize: '15px' }}>
                        {asset.lastClose ? Number(asset.lastClose).toLocaleString('id-ID') : '-'}
                      </div>
                      <div
                        className={`mono ${isPositive ? 'trend-up' : 'trend-down'}`}
                        style={{
                          fontSize: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '3px',
                          marginTop: '2px',
                        }}
                      >
                        {isPositive ? <IconTrendUp size={12} /> : <IconTrendDown size={12} />}
                        <span>
                          {asset.changePct ? (asset.changePct > 0 ? '+' : '') + asset.changePct.toFixed(2) + '%' : '0.00%'}
                        </span>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        </section>
      )}

      {/* Konsol Interaktif Dialektika Sidang Komite (Asset Switcher & Transkrip 4 Agen) */}
      <LandingDeliberationConsole instruments={instruments} />

      {/* 4 Agen Spesialis (The AI Committee) */}
      <section className="landing-section">
        <div className="landing-section-container">
          <div className="landing-section-head">
            <p className="eyebrow">Dialektika Kuantitatif</p>
            <h2 className="landing-section-title">4 Agen Spesialis Sidang Komite</h2>
            <p className="landing-section-desc">
              Keputusan investasi lahir dari ketegangan dialektis antara pengawas fakta, pemburu pertumbuhan,
              dan penjaga risiko modal sebelum putusan final disahkan.
            </p>
          </div>

          <div className="landing-agents-grid">
            {/* Agen 1: Analis Data */}
            <div className="landing-agent-card">
              <div className="agent-card-header">
                <div className="agent-icon-box" style={{ borderColor: 'var(--blue)' }}>
                  <IconCandles size={18} />
                </div>
                <div>
                  <span className="tag mono" style={{ color: 'var(--blue)', borderColor: 'rgba(59,130,246,0.3)' }}>
                    Fakta Objektif
                  </span>
                  <h3 className="agent-card-name">Analis Data Kuantitatif</h3>
                </div>
              </div>
              <p className="agent-card-desc">
                Menyajikan 100% fakta statistik tanpa asumsi: rasio volume 20v100, jarak harga terhadap SMA20/50/200,
                volatilitas terukur, dan drawdown historis. Menolak narasi tanpa angka pendukung.
              </p>
              <div className="agent-card-protocol mono">
                <span>Protokol:</span> Zero Hallucination Audit
              </div>
            </div>

            {/* Agen 2: Strateg Portofolio */}
            <div className="landing-agent-card">
              <div className="agent-card-header">
                <div className="agent-icon-box" style={{ borderColor: 'var(--green)' }}>
                  <IconTarget size={18} />
                </div>
                <div>
                  <span className="tag mono" style={{ color: 'var(--green)', borderColor: 'rgba(34,197,94,0.3)' }}>
                    Sudut Bullish
                  </span>
                  <h3 className="agent-card-name">Strateg Portofolio</h3>
                </div>
              </div>
              <p className="agent-card-desc">
                Membela potensi pertumbuhan dan momentum tren. Menentukan horizon waktu investasi, ukuran
                posisi yang rasional, serta target keuntungan asimetris berbasis pembuktian data.
              </p>
              <div className="agent-card-protocol mono">
                <span>Fokus:</span> Pertumbuhan Asimetris &amp; Momentum
              </div>
            </div>

            {/* Agen 3: Pengawas Risiko */}
            <div className="landing-agent-card">
              <div className="agent-card-header">
                <div className="agent-icon-box" style={{ borderColor: 'var(--red)' }}>
                  <IconShield size={18} />
                </div>
                <div>
                  <span className="tag mono" style={{ color: 'var(--red)', borderColor: 'rgba(239,68,68,0.3)' }}>
                    Sudut Bearish (Veto)
                  </span>
                  <h3 className="agent-card-name">Pengawas Risiko</h3>
                </div>
              </div>
              <p className="agent-card-desc">
                Mencari celah kerapuhan tesis. Menguji skenario terburuk, ruang koreksi ke rata-rata bergerak,
                dan memiliki <strong>Hak Veto Deadlock</strong> untuk membatalkan pembelian jika proteksi modal terancam.
              </p>
              <div className="agent-card-protocol mono">
                <span>Kekuasaan:</span> Veto Deadlock &amp; Stop-Loss Wajib
              </div>
            </div>

            {/* Agen 4: Ketua Komite */}
            <div className="landing-agent-card">
              <div className="agent-card-header">
                <div className="agent-icon-box" style={{ borderColor: 'var(--amber)' }}>
                  <IconScales size={18} />
                </div>
                <div>
                  <span className="tag mono" style={{ color: 'var(--amber)', borderColor: 'rgba(245,158,11,0.3)' }}>
                    Putusan Resmi
                  </span>
                  <h3 className="agent-card-name">Ketua Komite</h3>
                </div>
              </div>
              <p className="agent-card-desc">
                Menimbang tensi perdebatan antara Strateg dan Pengawas Risiko. Menetapkan putusan resmi:
                <strong> Beli, Tahan, Jual, atau Abstain</strong> lengkap dengan persentase keyakinan bukti.
              </p>
              <div className="agent-card-protocol mono">
                <span>Output:</span> Putusan Terikat &amp; Skor Keyakinan
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Fitur Intelijen Makro & Geopolitik */}
      <section className="landing-section" style={{ borderTop: '1px solid var(--line)', background: 'var(--surface-0)' }}>
        <div className="landing-section-container">
          <div className="landing-section-head">
            <p className="eyebrow">Intelijen Global</p>
            <h2 className="landing-section-title">Warta Makroekonomi &amp; Geopolitik</h2>
            <p className="landing-section-desc">
              Hanya peristiwa global yang terbukti berdampak langsung pada harga komoditi, minyak, emas, dan nilai tukar
              yang lolos kurasi mesin AI. Kami membuang kebisingan media.
            </p>
          </div>

          <div className="landing-news-grid">
            {latestNews.map((item) => (
              <article key={item.id} className="landing-news-card">
                <div className="news-card-meta">
                  <span className="tag mono" style={{ fontSize: '10px' }}>
                    {item.category}
                  </span>
                  <span className="mono" style={{ fontSize: '11px', color: 'var(--amber)' }}>
                    Dampak: {item.impactScore}/10
                  </span>
                </div>
                <h3 className="news-card-title">
                  <Link href={`/berita/${item.slug}`}>{item.title}</Link>
                </h3>
                <p className="news-card-summary">{item.summary}</p>
                <div className="news-card-footer">
                  <span className="mono" style={{ fontSize: '11px', color: 'var(--ink-faint)' }}>
                    {new Date(item.publishedAt).toLocaleDateString('id-ID', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                  <Link href={`/berita/${item.slug}`} className="news-read-link">
                    Baca Analisis &rarr;
                  </Link>
                </div>
              </article>
            ))}

            {latestNews.length === 0 && (
              <div className="panel" style={{ gridColumn: '1 / -1' }}>
                <div className="panel-body">
                  <div className="blank">
                    <IconNews size={20} />
                    <div className="blank-title">Belum ada warta dampak tinggi tersimpan</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div style={{ textAlign: 'center', marginTop: 'var(--space-5)' }}>
            <Link href="/berita" className="btn btn-quiet" style={{ border: '1px solid var(--line)' }}>
              <span>Lihat Seluruh Warta Intelijen AI &rarr;</span>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer Publik */}
      <footer className="landing-footer">
        <div className="landing-section-container">
          <div className="landing-footer-grid">
            <div className="footer-col-brand">
              <div className="landing-brand">
                <span className="mark-glyph">
                  <IconPulse size={16} />
                </span>
                <span className="mark-name">Komite</span>
                <span className="mark-phase">f1</span>
              </div>
              <p className="footer-disclaimer">
                Komite adalah instrumen pengukur kuantitatif independen. Menampilkan data faktual, metrik risiko,
                dan sintesis komite multi-agen. Bukan rekomendasi atau anjuran transaksi keuangan.
              </p>
            </div>

            <div className="footer-col-nav">
              <span className="mono bold" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Terminal Pasar
              </span>
              <Link href="/ringkasan">Ringkasan Pasar</Link>
              <Link href="/instruments">Daftar 448 Instrumen</Link>
              <Link href="/berita">Warta Intelijen AI</Link>
              <Link href="/backtest">Laboratorium Backtest</Link>
            </div>

            <div className="footer-col-nav">
              <span className="mono bold" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Administrasi &amp; Mesin
              </span>
              <Link href="/pipeline">Status Pipeline Ingesti</Link>
              <Link href="/admin">Portal Admin Komite</Link>
              <Link href="/admin/berita">CMS Berita</Link>
              <Link href="/admin/ads">Manajemen Iklan</Link>
            </div>
          </div>

          <div className="footer-bottom-row mono">
            <span>&copy; {new Date().getFullYear()} Komite. All quantitative protocols reserved.</span>
            <span>Zero Hallucination Protocol v2.4</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
