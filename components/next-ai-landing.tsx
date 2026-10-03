'use client'

import type { CSSProperties } from 'react'
import Link from 'next/link'
import { HeroDust } from '@/components/hero-dust'

interface NextAiLandingProps {
  terminalHref?: string
  loginHref?: string
  registerHref?: string
  hideNav?: boolean
  terminalLabel?: string
}

/**
 * Kipas sinar radiant amber-emas di pojok kanan atas.
 */
export const BEAM_LAYERS = [
  { rot: 38, w: 190, blur: 46, peak: 0.55, len: 88, h: 620, dx: 0 },
  { rot: 47, w: 130, blur: 28, peak: 0.85, len: 94, h: 620, dx: 0 },
  { rot: 55, w: 150, blur: 15, peak: 1, len: 100, h: 620, dx: 0 },
  { rot: 62, w: 110, blur: 26, peak: 0.85, len: 92, h: 620, dx: 0 },
  { rot: 71, w: 170, blur: 42, peak: 0.5, len: 84, h: 620, dx: 0 },
  { rot: 48, w: 64, blur: 12, peak: 0.95, len: 100, h: 1180, dx: 62 },
]


export function NextAiLanding({
  terminalHref = '/ringkasan',
  loginHref = '/login',
  registerHref = '/daftar',
  hideNav = false,
  terminalLabel = 'Buka Terminal',
}: NextAiLandingProps) {
  return (
    <div className="nextai-root">

      {/* ------------------------------------------------------------------
          1. HEADER / NAVIGATION BAR (DITAMPILKAN HANYA JIKA hideNav === false)
          ------------------------------------------------------------------ */}
      {!hideNav && (
        <header className="nextai-nav">
          <div className="nextai-nav-inner">
            <Link href="/" className="nextai-logo">
              <span className="nextai-logo-icon">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
                  <path
                    d="M12 2C12 7.5 7.5 12 2 12C7.5 12 12 16.5 12 22C12 16.5 16.5 12 22 12C16.5 12 12 7.5 12 2Z"
                    fill="#fa862a"
                  />
                  <circle cx="12" cy="12" r="3" fill="#140b06" />
                  <circle cx="12" cy="12" r="1.5" fill="#ffac60" />
                </svg>
              </span>
              <span className="nextai-logo-text">AI Investdesk</span>
            </Link>

            <nav className="nextai-links">
              <a href="#home" className="nextai-link active">Beranda</a>
              <a href="#features" className="nextai-link">Arsitektur</a>
              <a href="#terminal" className="nextai-link">Terminal</a>
              <a href="#akses" className="nextai-link">Akses Terbuka</a>
              <a href="#faqs" className="nextai-link">Tanya Jawab</a>
              <Link href="/warta" className="nextai-link">Warta Pasar</Link>
            </nav>

            <div className="nextai-actions">
              <Link href={loginHref} className="nextai-signin-btn">
                Masuk
              </Link>
              <Link href={registerHref} className="nextai-signup-btn">
                Daftar
              </Link>
            </div>
          </div>
        </header>
      )}

      {/* ------------------------------------------------------------------
          2. HERO SECTION WITH MAJESTIC TOP-RIGHT AMBER SUNBURST BEAM
          ------------------------------------------------------------------ */}
      <section className="nextai-hero" id="home">
        {/* Dynamic Radiant Amber Aurora Beams & Volumetric Rays */}
        <div className="nextai-aurora-beam" aria-hidden="true" />
        <div className="nextai-aurora-glow" aria-hidden="true" />
        <div className="nextai-aurora-subtle" aria-hidden="true" />

        {/* Berkas cahaya amber/emas */}
        <div className="nextai-aurora-rays" aria-hidden="true">
          {BEAM_LAYERS.map((layer, idx) => (
            <span
              key={layer.rot}
              className="nextai-ray"
              style={
                {
                  '--ray-rot': `${layer.rot}deg`,
                  '--ray-h': `${layer.h}px`,
                  '--ray-dx': `${layer.dx}px`,
                  '--ray-w': `${layer.w}px`,
                  '--ray-blur': `${layer.blur}px`,
                  '--ray-peak': layer.peak,
                  '--ray-len': `${layer.len}%`,
                  animationDelay: `${idx * 0.75}s`,
                } as CSSProperties
              }
            >
              <i />
            </span>
          ))}
        </div>

        {/* Debu yang berkilau saat lewat berkas cahaya */}
        <HeroDust />

        <div className="nextai-hero-container">
          {/* Badge */}
          <div className="nextai-pill-wrap">
            <div className="nextai-pill">
              <span className="nextai-pill-dot">✦</span>
              <span className="nextai-pill-text">
                Gratis · IDX, AS, kripto, emas <span className="nextai-pill-tag">Data, bukan anjuran</span>
              </span>
            </div>
          </div>

          {/* Main Hero Headline: 2 baris di desktop, 3 baris dengan pemenggalan tetap di mobile */}
          <h1 className="nextai-hero-title">
            <span className="title-desktop">
              <span className="title-line">Seberapa Besar Peluang</span>
              <span className="title-line">Saham Anda Naik?</span>
            </span>
            <span className="title-mobile">
              <span className="title-line">Seberapa Besar</span>
              <span className="title-line">Peluang Saham</span>
              <span className="title-line">Anda Naik?</span>
            </span>
          </h1>

          {/* Subtitle */}
          <p className="nextai-hero-desc">
            Lihat skor peluang saham, kripto, atau emas untuk sepekan, sekuartal, dan setahun ke depan —
            apa yang mendorongnya, apa yang menahannya, dan seberapa sering sinyal serupa terbukti benar dulu.
            Diperdebatkan empat agen AI, dihitung oleh kode yang bisa Anda periksa.
          </p>

          {/* Dual Action CTAs without glow pool */}
          <div className="nextai-cta-row">
            <Link href={terminalHref} className="nextai-btn-white">
              {terminalLabel}
            </Link>
            {/* Contoh publik tanpa daftar: pengunjung melihat hasilnya dulu, baru diminta akun. */}
            <Link href="/analisis/BBCA.JK" className="nextai-btn-ghost">
              Coba tanpa daftar: BBCA
            </Link>
          </div>
        </div>
      </section>

    </div>
  )
}
