'use client'

/**
 * Denyut pasar — sepuluh kartu yang isinya berganti sendiri.
 *
 * Sengaja bukan korsel. Korsel menggeser seluruh baris, jadi mata harus
 * mengejar posisi yang berpindah dan tidak ada satu pun kartu yang sempat
 * dibaca tuntas. Di sini posisinya diam; yang berganti isinya. Satu kartu
 * meredup sampai hilang, isinya ditukar saat tak terlihat, lalu muncul lagi
 * sebagai aset lain.
 *
 * Dan hanya satu kartu pada satu waktu. Sepuluh kartu yang berganti serentak
 * membuat seluruh bagian berkedip dan tidak ada yang terbaca; satu kartu yang
 * berganti justru menarik mata ke situ tanpa mengganggu sembilan yang lain.
 *
 * Tanpa pustaka animasi: peralihannya cuma `opacity` dan `transform` di CSS,
 * dan React hanya mengganti data di dalam simpul DOM yang sama. Kuncinya indeks
 * slot, bukan id aset — kalau kuncinya id, React akan membongkar-pasang simpulnya
 * dan peralihannya tidak pernah sempat berjalan.
 */

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { AssetIcon } from '@/components/asset-icons'
import { IconTrendUp, IconTrendDown } from '@/components/icons'
import { formatTickerPrice, formatChange } from '@/lib/format/market'

/**
 * Bentuk ramping satu aset.
 *
 * Sengaja bukan `InstrumentQuote` utuh. Prop komponen klien ikut terkirim ke
 * peramban di dalam muatan halaman, dan baris instrumen penuh membawa selusin
 * bidang yang tidak satu pun digambar di sini — riwayat, pasar, tanggal, jumlah
 * lilin. Yang tidak dipakai sebaiknya tidak ikut diangkut.
 */
export interface PulseAsset {
  symbol: string
  assetClass: string
  lastClose: number | null
  changePct: number | null
}

/** Lama satu kartu meredup. Harus sama dengan `--pulse-fade` di globals.css. */
const FADE_MS = 340

type Phase = 'idle' | 'out' | 'in'
type Slot = { asset: PulseAsset; phase: Phase }

export function LandingPulseGrid({
  pool,
  count = 10,
  intervalMs = 2800,
}: {
  /** Seluruh aset yang boleh muncul. Sepuluh pertama yang tampil lebih dulu. */
  pool: PulseAsset[]
  count?: number
  intervalMs?: number
}) {
  // Isi awal harus bisa ditebak: server dan render klien pertama menggambar
  // sepuluh aset yang sama persis, jadi tidak ada ketidakcocokan hidrasi.
  // Pengacakan baru boleh terjadi setelah komponen hidup, di dalam effect.
  const [slots, setSlots] = useState<Slot[]>(() =>
    pool.slice(0, count).map((asset) => ({ asset, phase: 'idle' as const })),
  )

  const slotsRef = useRef(slots)
  const cursorRef = useRef(count)
  const targetRef = useRef(0)
  const swapRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // Tidak ada yang bisa ditukar kalau cadangannya tidak lebih banyak daripada
    // yang sedang tampil.
    if (pool.length <= slotsRef.current.length) return

    // Orang yang meminta gerak seperlunya tetap mendapat seluruh datanya —
    // yang dihilangkan cuma perputarannya, bukan isinya.
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) return

    const tick = setInterval(() => {
      const current = slotsRef.current
      const target = targetRef.current % current.length
      targetRef.current = target + 1

      // Aset yang sedang tampil dilewati, supaya tidak ada simbol kembar di layar.
      const shown = new Set(current.map((slot) => slot.asset.symbol))
      let next: PulseAsset | null = null

      for (let step = 0; step < pool.length; step++) {
        const candidate = pool[(cursorRef.current + step) % pool.length]
        if (!shown.has(candidate.symbol)) {
          next = candidate
          cursorRef.current = (cursorRef.current + step + 1) % pool.length
          break
        }
      }

      if (!next) return

      const fading = current.map((slot, index) =>
        index === target ? { ...slot, phase: 'out' as const } : slot,
      )
      slotsRef.current = fading
      setSlots(fading)

      // Isinya ditukar tepat saat kartunya tak terlihat, jadi pergantiannya
      // tidak pernah tertangkap mata sebagai kedipan.
      swapRef.current = setTimeout(() => {
        const swapped = slotsRef.current.map((slot, index) =>
          index === target ? { asset: next as PulseAsset, phase: 'in' as const } : slot,
        )
        slotsRef.current = swapped
        setSlots(swapped)
      }, FADE_MS)
    }, intervalMs)

    return () => {
      clearInterval(tick)
      if (swapRef.current) clearTimeout(swapRef.current)
    }
  }, [pool, intervalMs])

  return (
    <div className="landing-ticker-grid">
      {slots.map((slot, index) => {
        const asset = slot.asset
        const isPositive = (asset.changePct ?? 0) >= 0

        return (
          <Link
            // Indeks slot, bukan id aset. Lihat catatan di kepala berkas.
            key={index}
            href={`/ringkasan?symbol=${encodeURIComponent(asset.symbol)}`}
            className="landing-ticker-card pulse-card"
            data-phase={slot.phase}
          >
            <div className="ticker-card-head">
              <span className="ticker-card-ident">
                <AssetIcon symbol={asset.symbol} size={18} />
                <span className="mono bold ticker-card-sym">{asset.symbol}</span>
              </span>
              <span className="tag mono ticker-card-class">{asset.assetClass}</span>
            </div>
            <div className="ticker-card-body">
              <div className="mono bold ticker-card-price">
                {formatTickerPrice(asset.lastClose, asset.assetClass)}
              </div>
              <div className={`mono ticker-card-chg ${isPositive ? 'trend-up' : 'trend-down'}`}>
                {isPositive ? <IconTrendUp size={12} /> : <IconTrendDown size={12} />}
                <span>{formatChange(asset.changePct)}</span>
              </div>
            </div>
          </Link>
        )
      })}
    </div>
  )
}
