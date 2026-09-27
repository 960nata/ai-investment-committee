'use client'

import { useEffect, useRef } from 'react'

/*
 * Debu emas halus atmosferik di seksi penutup ("Lihat sendiri datanya").
 * Partikel mikro berukuran lembut, melayang tenang di bawah kubah pendar amber,
 * tanpa kedip/glitch, murni mengikuti denyut napas kubah cahaya.
 */

interface Mote {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  phase: number
}

export function ClosingDust() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let width = 0
    let height = 0
    let motes: Mote[] = []
    let frame = 0
    let visible = true

    function spawn(anywhere: boolean): Mote {
      let x: number
      let y: number
      if (anywhere || Math.random() < 0.25) {
        x = Math.random() * width
        y = Math.random() * height
      } else {
        const spread = (Math.random() - 0.5) * Math.min(width * 0.65, 600)
        x = width * 0.5 + spread
        y = Math.random() * Math.min(height * 0.85, 420)
      }
      return {
        x,
        y,
        vx: (Math.random() - 0.5) * 0.08,
        vy: -0.03 - Math.random() * 0.05, // Melayang naik sangat perlahan
        r: 0.35 + Math.random() * 0.45,  // Partikel mikro halus (0.35px - 0.8px)
        phase: Math.random() * Math.PI * 2,
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

      // Jumlah sedikit dan elegan (~16 di mobile, max ~24 di desktop)
      const count = Math.min(24, Math.max(14, Math.round((width * height) / 40000)))
      motes = Array.from({ length: count }, () => spawn(true))
    }

    /** Seberapa terang cahaya di titik ini relatif terhadap kubah cahaya atas */
    function lightAt(x: number, y: number): number {
      const dx = (x - width * 0.5) / (width * 0.45)
      const dy = y / (height * 0.85)
      const dist = Math.hypot(dx * 1.3, dy)
      return Math.max(0, 1 - dist)
    }

    function draw(time: number) {
      if (!ctx) return
      ctx.clearRect(0, 0, width, height)
      ctx.globalCompositeOperation = 'lighter'

      // Denyut napas cahaya penutup (~7s siklus halus, selaras dengan CSS glow)
      const beamPulse = 0.65 + 0.35 * Math.sin(time * 0.0009)

      for (let i = 0; i < motes.length; i++) {
        const m = motes[i]
        if (!reduceMotion) {
          m.x += m.vx + Math.sin(time * 0.0003 + m.phase) * 0.03
          m.y += m.vy
          if (m.x < -20 || m.x > width + 20 || m.y < -20 || m.y > height + 20) {
            motes[i] = spawn(false)
            continue
          }
        }

        // Fade tepi canvas agar tidak popping
        const edgeX = Math.min(1, Math.min(m.x + 15, width + 15 - m.x) / 35)
        const edgeY = Math.min(1, Math.min(m.y + 15, height + 15 - m.y) / 35)
        const edgeFade = Math.max(0, Math.min(edgeX, edgeY))

        const rawLight = lightAt(m.x, m.y)
        const light = rawLight * beamPulse * edgeFade
        if (light < 0.03) continue

        const alpha = Math.min(0.85, light * 0.85)

        // Pendar lembut bergradasi mikro
        const haloR = m.r * 2.2
        const g = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, haloR)
        g.addColorStop(0, `rgba(255, 220, 175, ${alpha})`)
        g.addColorStop(0.5, `rgba(250, 140, 50, ${alpha * 0.35})`)
        g.addColorStop(1, 'rgba(250, 140, 50, 0)')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(m.x, m.y, haloR, 0, Math.PI * 2)
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

  return <canvas ref={canvasRef} className="lp-closing-dust" aria-hidden="true" />
}
