'use client'

import { useEffect, useRef } from 'react'

/*
 * Debu yang melayang di ruang hero dan baru terlihat saat lewat berkas cahaya.
 *
 * Geometrinya harus sama dengan `.nextai-aurora-rays`: sumbernya di pojok kanan
 * atas (right 4%, top -40px), dan tiap sinar adalah elemen yang menggantung ke
 * bawah lalu diputar searah jarum jam. Sudut sebuah titik dihitung dengan cara
 * yang sama, jadi terang-redupnya partikel mengikuti letak sinar yang benar-benar
 * tergambar, bukan tebakan kasar.
 */

const BEAM_CENTER_DEG = 55
const BEAM_SPREAD_DEG = 13
const BEAM_REACH_PX = 1100
const SOURCE_RIGHT_RATIO = 0.04
const SOURCE_TOP_PX = -40

interface Mote {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  phase: number
  twinkle: number
}

export function HeroDust() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let width = 0
    let height = 0
    let ox = 0
    let oy = SOURCE_TOP_PX
    let motes: Mote[] = []
    let frame = 0
    let visible = true

    // Kebanyakan partikel ditaruh di dalam kerucut sinar, sisanya tersebar
    // rata. Tanpa bias ini sebagian besar partikel akan menghabiskan hidupnya
    // di kegelapan dan cahayanya terasa kosong.
    function spawn(anywhere: boolean): Mote {
      let x: number
      let y: number
      if (anywhere || Math.random() < 0.3) {
        x = Math.random() * width
        y = Math.random() * height
      } else {
        const deg = BEAM_CENTER_DEG + (Math.random() * 2 - 1) * BEAM_SPREAD_DEG * 1.6
        const rad = (deg * Math.PI) / 180
        const dist = 60 + Math.random() * BEAM_REACH_PX
        x = ox - Math.sin(rad) * dist
        y = oy + Math.cos(rad) * dist
      }
      return {
        x,
        y,
        vx: (Math.random() - 0.5) * 0.12,
        vy: (Math.random() - 0.35) * 0.1,
        r: 0.25 + Math.random() * 0.6,
        phase: Math.random() * Math.PI * 2,
        twinkle: 0.4 + Math.random() * 1.2,
      }
    }

    function resize() {
      if (!canvas || !ctx) return
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = rect.width
      height = rect.height
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ox = width * (1 - SOURCE_RIGHT_RATIO)
      oy = SOURCE_TOP_PX

      const count = Math.min(30, Math.round((width * height) / 40000))
      motes = Array.from({ length: count }, () => spawn(true))
    }

    /** Seberapa terang cahaya di titik ini, 0 sampai 1. */
    function lightAt(x: number, y: number): number {
      const vx = x - ox
      const vy = y - oy
      const dist = Math.hypot(vx, vy)
      if (dist > BEAM_REACH_PX * 1.15) return 0
      const deg = (Math.atan2(-vx, vy) * 180) / Math.PI
      const off = (deg - BEAM_CENTER_DEG) / BEAM_SPREAD_DEG
      const across = Math.exp(-off * off)
      const along = Math.max(0, 1 - dist / (BEAM_REACH_PX * 1.15))
      return across * along
    }

    function draw(time: number) {
      if (!ctx) return
      ctx.clearRect(0, 0, width, height)
      ctx.globalCompositeOperation = 'lighter'

      for (let i = 0; i < motes.length; i++) {
        const m = motes[i]
        if (!reduceMotion) {
          m.x += m.vx + Math.sin(time * 0.0003 + m.phase) * 0.05
          m.y += m.vy
          if (m.x < -20 || m.x > width + 20 || m.y < -20 || m.y > height + 20) {
            motes[i] = spawn(false)
            continue
          }
        }

        const light = lightAt(m.x, m.y)
        const flicker = 0.65 + 0.35 * Math.sin(time * 0.001 * m.twinkle + m.phase)
        // Di luar sinar partikel nyaris tak terlihat — seperti debu sungguhan.
        const alpha = 0.04 + light * 0.9 * flicker
        if (alpha < 0.05) continue

        if (light > 0.25) {
          const halo = m.r * 3
          const g = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, halo)
          g.addColorStop(0, `rgba(255, 172, 96, ${alpha * 0.35})`)
          g.addColorStop(1, 'rgba(250, 134, 42, 0)')
          ctx.fillStyle = g
          ctx.beginPath()
          ctx.arc(m.x, m.y, halo, 0, Math.PI * 2)
          ctx.fill()
        }

        ctx.fillStyle = `rgba(255, 214, 170, ${alpha})`
        ctx.beginPath()
        ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    function loop(time: number) {
      draw(time)
      if (visible && !reduceMotion) frame = requestAnimationFrame(loop)
    }

    resize()
    frame = requestAnimationFrame(loop)

    const resizeObserver = new ResizeObserver(() => {
      resize()
      if (reduceMotion) draw(0)
    })
    resizeObserver.observe(canvas)

    // Hero yang sudah tergulir lewat tidak perlu digambar ulang 60 kali sedetik.
    const intersection = new IntersectionObserver(([entry]) => {
      const wasVisible = visible
      visible = entry.isIntersecting
      if (visible && !wasVisible && !reduceMotion) frame = requestAnimationFrame(loop)
      if (!visible) cancelAnimationFrame(frame)
    })
    intersection.observe(canvas)

    return () => {
      cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      intersection.disconnect()
    }
  }, [])

  return <canvas ref={canvasRef} className="nextai-dust" aria-hidden="true" />
}
