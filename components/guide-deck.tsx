'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { GUIDE, type GuideSlide } from '@/lib/i18n/guide'
import type { Locale } from '@/lib/i18n/locales'

/*
 * Panduan pengguna berbentuk dek slide.
 *
 * Satu gagasan per slide, gambar besar, kalimat pendek — bentuk yang paling
 * mudah dicerna orang yang belum pernah melihat terminal analisis. Bisa digeser
 * di ponsel, dipindah dengan tombol panah, atau diklik titiknya. Nomor slide
 * disimpan di alamat (#3) supaya satu slide bisa dibagikan langsung.
 */

export function GuideDeck({ locale, terminalHref }: { locale: Locale; terminalHref: string }) {
  const content = GUIDE[locale]
  const total = content.slides.length
  const [index, setIndex] = useState(0)
  const touch = useRef<{ x: number; y: number } | null>(null)

  const go = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(total - 1, next))
      setIndex(clamped)
      history.replaceState(null, '', `#${clamped + 1}`)
    },
    [total],
  )

  // Ikuti nomor slide di alamat: saat halaman dibuka (#3 langsung ke slide
  // tiga) dan saat tombol kembali peramban mengubahnya.
  useEffect(() => {
    const sync = () => {
      const n = Number(window.location.hash.slice(1))
      if (Number.isInteger(n) && n >= 1 && n <= total) setIndex(n - 1)
    }
    const frame = requestAnimationFrame(sync)
    window.addEventListener('hashchange', sync)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('hashchange', sync)
    }
  }, [total])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest('input, textarea')) return
      if (e.key === 'ArrowRight' || e.key === 'PageDown') go(index + 1)
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') go(index - 1)
      if (e.key === 'Home') go(0)
      if (e.key === 'End') go(total - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, index, total])

  const onTouchStart = (e: React.TouchEvent) => {
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }

  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touch.current) return
    const dx = e.changedTouches[0].clientX - touch.current.x
    const dy = e.changedTouches[0].clientY - touch.current.y
    touch.current = null
    // Hanya geseran yang jelas mendatar; gulir tegak dibiarkan menggulir halaman.
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(index + (dx < 0 ? 1 : -1))
  }

  const isLast = index === total - 1

  return (
    <section
      className="gd"
      aria-roledescription="carousel"
      aria-label={content.deckLabel}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className="gd-progress" aria-hidden="true">
        <span style={{ width: `${((index + 1) / total) * 100}%` }} />
      </div>

      <div className="gd-viewport">
        <div className="gd-track" style={{ transform: `translateX(-${index * 100}%)` }}>
          {content.slides.map((slide, i) => (
            <article
              key={slide.art}
              className={`gd-slide${i === index ? ' is-active' : ''}`}
              aria-roledescription="slide"
              aria-label={content.slideOf(i + 1, total)}
              aria-hidden={i !== index}
            >
              <div className="gd-art">
                <SlideArt slide={slide} />
              </div>
              <div className="gd-copy">
                <p className="gd-kicker">
                  <span className="gd-num">{String(i + 1).padStart(2, '0')}</span>
                  {slide.kicker}
                </p>
                <h2 className="gd-title">{slide.title}</h2>
                <p className="gd-body">{slide.body}</p>

                {i === total - 1 && (
                  <div className="gd-cta">
                    <Link href={terminalHref} className="nextai-btn-white" tabIndex={isLast ? 0 : -1}>
                      {content.ctaPrimary}
                    </Link>
                    <Link href="/metodologi" className="nextai-btn-ghost" tabIndex={isLast ? 0 : -1}>
                      {content.ctaSecondary}
                    </Link>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="gd-controls">
        <button type="button" className="gd-btn" onClick={() => go(index - 1)} disabled={index === 0}>
          ← {content.prev}
        </button>

        <div className="gd-dots" role="tablist">
          {content.slides.map((s, i) => (
            <button
              key={s.art}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={content.slideOf(i + 1, total)}
              className="gd-dot"
              onClick={() => go(i)}
            />
          ))}
        </div>

        <button
          type="button"
          className="gd-btn gd-btn-next"
          onClick={() => go(index + 1)}
          disabled={isLast}
        >
          {content.next} →
        </button>
      </div>

      <p className="gd-hint">
        <span>{content.slideOf(index + 1, total)}</span>
        <span>{content.hint}</span>
      </p>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Gambar per slide — CSS dan SVG, tanpa berkas gambar
// ---------------------------------------------------------------------------

function SlideArt({ slide }: { slide: GuideSlide }) {
  const l = slide.labels ?? []

  switch (slide.art) {
    case 'hello':
      return (
        <div className="ga ga-hello">
          <span className="ga-ring" />
          <span className="ga-ring ga-ring-2" />
          <svg viewBox="0 0 24 24" className="ga-spark" aria-hidden="true">
            <path
              d="M12 2C12 7.5 7.5 12 2 12C7.5 12 12 16.5 12 22C12 16.5 16.5 12 22 12C16.5 12 12 7.5 12 2Z"
              fill="#fa862a"
            />
            <circle cx="12" cy="12" r="3" fill="#140b06" />
            <circle cx="12" cy="12" r="1.5" fill="#ffac60" />
          </svg>
        </div>
      )

    case 'noise':
      return (
        <div className="ga ga-noise">
          {l.map((text, i) => (
            <span key={text} className={`ga-bubble b${i}`}>
              {text}
            </span>
          ))}
          <span className="ga-noise-x" aria-hidden="true" />
        </div>
      )

    case 'prices':
      return (
        <div className="ga ga-prices">
          <svg viewBox="0 0 220 130" className="ga-candles" aria-hidden="true">
            {[
              [18, 70, 95, 60, 100, 1],
              [42, 62, 80, 52, 88, 1],
              [66, 78, 64, 56, 86, 0],
              [90, 55, 70, 46, 76, 1],
              [114, 44, 58, 36, 64, 1],
              [138, 60, 46, 40, 68, 0],
              [162, 38, 52, 30, 58, 1],
              [186, 26, 40, 18, 46, 1],
            ].map(([x, top, bottom, hi, lo, up]) => (
              <g key={x} className={up ? 'up' : 'down'}>
                <line x1={x} x2={x} y1={hi} y2={lo} />
                <rect x={x - 7} y={Math.min(top, bottom)} width="14" height={Math.abs(bottom - top)} rx="2" />
              </g>
            ))}
          </svg>
          <div className="ga-chips">
            {l.map((text) => (
              <span key={text}>{text}</span>
            ))}
          </div>
        </div>
      )

    case 'formula':
      return (
        <div className="ga ga-formula">
          <div className="ga-inputs">
            {l.map((text) => (
              <span key={text}>{text}</span>
            ))}
          </div>
          <span className="ga-arrow" aria-hidden="true" />
          <div className="ga-fx">
            <span>f(x)</span>
          </div>
          <span className="ga-arrow" aria-hidden="true" />
          <div className="ga-out">
            <span>1,42</span>
            <span>+3,2%</span>
            <span>p99</span>
          </div>
        </div>
      )

    case 'debate':
      return (
        <div className="ga ga-debate">
          {['AN', 'ST', 'RI', 'KE'].map((initials, i) => (
            <div key={initials} className={`ga-seat s${i}`}>
              <span className="ga-avatar">{initials}</span>
              <span className="ga-seat-label">{l[i]}</span>
              <span className="ga-talk" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
            </div>
          ))}
        </div>
      )

    case 'reading':
      return (
        <div className="ga ga-reading">
          {l.map((text, i) => (
            <span key={text} className={`ga-verdict v${i}`}>
              {text}
            </span>
          ))}
          <span className="ga-pointer" aria-hidden="true" />
        </div>
      )

    case 'unknown':
      return (
        <div className="ga ga-unknown">
          <span className="ga-q" aria-hidden="true">
            ?
          </span>
          <span className="ga-badge">{l[0]}</span>
        </div>
      )

    case 'steps':
      return (
        <div className="ga ga-steps">
          {l.map((text, i) => (
            <div key={text} className="ga-step">
              <span className="ga-step-no">{i + 1}</span>
              <span className="ga-step-text">{text}</span>
            </div>
          ))}
        </div>
      )

    case 'promise':
      return (
        <div className="ga ga-promise">
          <svg viewBox="0 0 120 120" aria-hidden="true">
            <circle cx="60" cy="60" r="50" className="ga-promise-ring" />
            <path d="M38 62 L54 77 L84 45" className="ga-promise-check" />
          </svg>
        </div>
      )
  }
}
