'use client'

/**
 * Pita harga berjalan (marquee).
 *
 * Isinya digandakan tepat dua kali lalu seluruh jalur digeser -50%. Pada akhir
 * animasi salinan kedua berdiri persis di tempat salinan pertama memulai, jadi
 * pengulangan tidak pernah terlihat sebagai lompatan. Cara lain — menggeser satu
 * salinan lalu mengembalikannya ke nol — selalu menyisakan kedipan di ujung.
 *
 * Kecepatan diikat ke jumlah kartu, bukan ke durasi tetap. Durasi tetap membuat
 * pita dengan enam aset merayap dan pita dengan dua puluh aset berlari.
 */

import Link from 'next/link'
import { AssetIcon } from '@/components/asset-icons'
import { IconTrendUp, IconTrendDown } from '@/components/icons'
import { formatTickerPrice, formatChange } from '@/lib/format/market'

export interface MarqueeTicker {
  key: string
  category: string
  symbol: string
  name: string
  assetClass: string
  lastClose: number | null
  changePct: number | null
}

interface Props {
  items: MarqueeTicker[]
  /** Detik yang disumbang tiap kartu ke lama satu putaran penuh. */
  secondsPerItem?: number
  className?: string
}

/**
 * Jumlah kartu paling sedikit dalam satu salinan.
 *
 * Satu salinan yang lebih sempit daripada jendela akan terlihat habis di
 * tengah putaran dan meninggalkan celah kosong yang bergerak. Daftar pendek
 * karena itu diulang sampai cukup lebar sebelum digandakan.
 */
const MIN_ITEMS_PER_GROUP = 10

export function MarketMarquee({ items, secondsPerItem = 3.4, className }: Props) {
  if (items.length === 0) return null

  const repeats = Math.max(1, Math.ceil(MIN_ITEMS_PER_GROUP / items.length))
  const filled: MarqueeTicker[] =
    repeats === 1
      ? items
      : Array.from({ length: repeats }, (_, round) =>
          items.map((item) => ({ ...item, key: `${item.key}-r${round}` })),
        ).flat()

  // Minimal 20 detik supaya pita pendek tidak berkedip cepat.
  const duration = Math.max(20, Math.round(filled.length * secondsPerItem))

  return (
    <div
      className={`marquee${className ? ` ${className}` : ''}`}
      style={{ ['--marquee-duration' as string]: `${duration}s` }}
    >
      <div className="marquee-track">
        <MarqueeGroup items={filled} />
        {/* Salinan kedua hanya untuk mata, bukan untuk pembaca layar. */}
        <MarqueeGroup items={filled} clone />
      </div>
    </div>
  )
}

function MarqueeGroup({ items, clone }: { items: MarqueeTicker[]; clone?: boolean }) {
  return (
    <div className="marquee-group" aria-hidden={clone ? true : undefined}>
      {items.map((item) => {
        const isPositive = (item.changePct ?? 0) >= 0
        return (
          <Link
            key={`${clone ? 'clone-' : ''}${item.key}`}
            href={`/ringkasan?symbol=${encodeURIComponent(item.symbol)}`}
            className="marquee-chip"
            title={`${item.name} (${item.symbol})`}
            tabIndex={clone ? -1 : undefined}
          >
            <span className="marquee-chip-cat mono">{item.category}</span>
            <AssetIcon symbol={item.symbol} size={13} />
            <span className="marquee-chip-sym mono">{item.symbol}</span>
            <span className="marquee-chip-price mono">
              {formatTickerPrice(item.lastClose, item.assetClass)}
            </span>
            <span className={`marquee-chip-chg mono ${isPositive ? 'trend-up' : 'trend-down'}`}>
              {isPositive ? <IconTrendUp size={11} /> : <IconTrendDown size={11} />}
              <span>{formatChange(item.changePct)}</span>
            </span>
          </Link>
        )
      })}
    </div>
  )
}
