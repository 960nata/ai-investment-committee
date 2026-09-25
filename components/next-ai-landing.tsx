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
const BEAM_LAYERS = [
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
              <span className="nextai-logo-text">Komite Investasi AI</span>
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
          {BEAM_LAYERS.map((layer) => (
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
                Mesin Analisis Probabilistik Multi-Agen <span className="nextai-pill-tag">Zero Hallucination</span>
              </span>
            </div>
          </div>

          {/* Main Hero Headline (2 Baris) */}
          <h1 className="nextai-hero-title">
            <span className="title-line">Keputusan Investasi Presisi Lewat</span>
            <span className="title-line">Deliberasi Multi-Agen AI</span>
          </h1>

          {/* Subtitle */}
          <p className="nextai-hero-desc">
            Bukan ramalan harga klenik. Sistem analisis probabilistik independen yang mempertemukan
            analis kuantitatif, pakar strategi, dan pengawas risiko berveto untuk membedah saham IDX, kripto, dan komoditas secara matematis.
          </p>

          {/* Dual Action CTAs without glow pool */}
          <div className="nextai-cta-row">
            <Link href={terminalHref} className="nextai-btn-white">
              {terminalLabel}
            </Link>
            <Link href="/metodologi" className="nextai-btn-ghost">
              Baca Metodologi
            </Link>
          </div>
        </div>
      </section>

    </div>
  )
}
