/**
 * Kaki halaman publik.
 *
 * Dipakai beranda dan portal warta publik. Satu berkas, bukan dua salinan:
 * kaki halaman yang digandakan adalah kaki halaman yang cepat atau lambat
 * berbeda isinya di satu tempat tanpa ada yang menyadarinya.
 *
 * Tautan ke terminal sengaja dibiarkan apa adanya meski halamannya terkunci.
 * Pengunjung yang menekannya akan dibawa ke halaman masuk dengan alamat tujuan
 * terbawa, jadi tautannya tetap mengantar ke tempat yang benar — hanya lewat
 * satu pintu dulu.
 */

import Link from 'next/link'
import { IconPulse } from '@/components/icons'

export function LandingFooter() {
  return (
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
              Komite adalah instrumen pengukur kuantitatif independen. Menampilkan data faktual,
              metrik risiko, dan sintesis komite multi-agen. Bukan rekomendasi atau anjuran
              transaksi keuangan.
            </p>
          </div>

          <div className="footer-col-nav">
            <span className="mono footer-col-title">Terminal Pasar</span>
            <Link href="/ringkasan">Ringkasan Pasar</Link>
            <Link href="/ringkasan?tab=crypto">Kripto</Link>
            <Link href="/ringkasan?tab=saham">Saham IDX</Link>
            <Link href="/ringkasan?tab=emas">Emas &amp; Logam Mulia</Link>
            <Link href="/ringkasan?tab=komoditi">Komoditas Energi</Link>
            <Link href="/instruments">Cakupan Riwayat Data</Link>
          </div>

          <div className="footer-col-nav">
            <span className="mono footer-col-title">Warta &amp; Riset</span>
            <Link href="/warta">Semua Warta Intelijen</Link>
            <Link href="/warta?kategori=ekonomi-makro">Ekonomi Makro</Link>
            <Link href="/warta?kategori=energi-komoditas">Energi &amp; Komoditas</Link>
            <Link href="/warta?kategori=teknologi-ai">Teknologi &amp; AI</Link>
            <Link href="/backtest">Laboratorium Backtest</Link>
            <Link href="/pipeline">Status Pipeline Ingesti</Link>
          </div>

          <div className="footer-col-nav">
            <span className="mono footer-col-title">Panduan</span>
            <Link href="/#cara-kerja">Cara Kerja Komite</Link>
            <Link href="/#agen">Mengenal 4 Agen AI</Link>
            <Link href="/#cara-baca">Cara Membaca Putusan</Link>
            <Link href="/login">Masuk ke Akun (Pengguna)</Link>
            <Link href="/daftar">Daftar Akun Baru</Link>
            <Link href="/admin/login" style={{ color: 'var(--signal)' }}>Portal Administrator</Link>
          </div>
        </div>

        <div className="footer-bottom-row mono">
          <span>&copy; {new Date().getFullYear()} Komite. All quantitative protocols reserved.</span>
          <span>Zero Hallucination Protocol v2.4</span>
        </div>
      </div>
    </footer>
  )
}
