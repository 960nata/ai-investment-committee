/**
 * Lambang aset sebagai SVG.
 *
 * Mengikuti prinsip yang sama dengan `flags.tsx`, bukan dengan `icons.tsx`.
 * Ikon di `icons.tsx` adalah simbol fungsi — garis tipis, tanpa isian, mewarisi
 * warna teks. Yang di sini adalah lambang identitas, dan identitas pada ukuran
 * enam belas piksel dikenali dari warna serta siluetnya, bukan dari detailnya.
 * Lambang bergaris tipis dengan warna teks akan terbaca sebagai noda seragam
 * di dalam daftar padat — persis kegagalan yang dihindari berkas bendera.
 *
 * Bentuknya sengaja disederhanakan jadi geometri dasar: ini penanda untuk
 * mengenali baris mana yang sedang dibaca, bukan reproduksi aset merek. Untuk
 * lambang resmi, yang benar adalah memasang paket ikon berlisensi, bukan
 * menggambar ulang dari ingatan.
 *
 * Aset di luar daftar jatuh ke monogram huruf, sehingga menambah instrumen baru
 * tidak pernah menghasilkan baris tanpa lambang.
 */

interface AssetIconProps {
  symbol: string
  size?: number
  /**
   * Isi hanya bila lambang berdiri sendiri. Di dalam daftar, simbolnya sudah
   * tertulis sebagai teks di sebelahnya, jadi lambang harus disembunyikan dari
   * pembaca layar agar namanya tidak terbaca dua kali.
   */
  label?: string
}

/** Kepingan bundar berwarna merek dengan lambang putih di tengah. */
function Token({
  fill,
  size,
  label,
  children,
}: {
  fill: string
  size: number
  label?: string
  children: React.ReactNode
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      style={{ flex: 'none', display: 'block' }}
    >
      <circle cx="12" cy="12" r="12" fill={fill} />
      <g fill="#fff" stroke="none">
        {children}
      </g>
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Crypto
// ---------------------------------------------------------------------------

const MARKS: Record<string, { fill: string; glyph: React.ReactNode }> = {
  BTC: {
    fill: '#f7931a',
    glyph: (
      <>
        <rect x="9.6" y="5" width="1.5" height="14" rx="0.4" />
        <rect x="12.2" y="5" width="1.5" height="14" rx="0.4" />
        <path d="M8 7.2h5.6a2.6 2.6 0 0 1 0 5.2H8zM8 12h6a2.6 2.6 0 0 1 0 5.2H8z" />
      </>
    ),
  },
  ETH: {
    fill: '#627eea',
    glyph: (
      <>
        <path d="M12 3.4 6.6 12 12 15.2 17.4 12z" opacity="0.9" />
        <path d="M6.6 13.2 12 16.4l5.4-3.2L12 20.6z" opacity="0.65" />
      </>
    ),
  },
  BNB: {
    fill: '#f3ba2f',
    glyph: (
      <>
        <rect x="9.2" y="9.2" width="5.6" height="5.6" rx="0.6" transform="rotate(45 12 12)" />
        <rect x="10.4" y="3.4" width="3.2" height="3.2" rx="0.4" transform="rotate(45 12 5)" />
        <rect x="10.4" y="17.4" width="3.2" height="3.2" rx="0.4" transform="rotate(45 12 19)" />
        <rect x="3.4" y="10.4" width="3.2" height="3.2" rx="0.4" transform="rotate(45 5 12)" />
        <rect x="17.4" y="10.4" width="3.2" height="3.2" rx="0.4" transform="rotate(45 19 12)" />
      </>
    ),
  },
  SOL: {
    fill: '#9945ff',
    glyph: (
      <>
        <path d="M7.4 6.6h11l-2.8 2.6h-11z" />
        <path d="M4.6 11.1h11l2.8 2.6h-11z" opacity="0.85" />
        <path d="M7.4 15.6h11l-2.8 2.6h-11z" opacity="0.7" />
      </>
    ),
  },
  XRP: {
    fill: '#23292f',
    glyph: (
      <path d="M6.4 5.6h2.4l3.2 3.4 3.2-3.4h2.4L13.2 11l4.4 5.4h-2.4L12 13l-3.2 3.4H6.4L10.8 11z" />
    ),
  },
  ADA: {
    fill: '#0033ad',
    glyph: (
      <>
        <circle cx="12" cy="12" r="2.1" />
        <circle cx="12" cy="5.6" r="1.25" />
        <circle cx="12" cy="18.4" r="1.25" />
        <circle cx="6.4" cy="8.8" r="1.25" />
        <circle cx="17.6" cy="8.8" r="1.25" />
        <circle cx="6.4" cy="15.2" r="1.25" />
        <circle cx="17.6" cy="15.2" r="1.25" />
      </>
    ),
  },
  DOT: {
    fill: '#e6007a',
    glyph: (
      <>
        <ellipse cx="12" cy="6.2" rx="2.6" ry="1.7" />
        <ellipse cx="12" cy="17.8" rx="2.6" ry="1.7" />
        <ellipse cx="7" cy="9.1" rx="2.6" ry="1.7" transform="rotate(-60 7 9.1)" />
        <ellipse cx="17" cy="14.9" rx="2.6" ry="1.7" transform="rotate(-60 17 14.9)" />
        <ellipse cx="7" cy="14.9" rx="2.6" ry="1.7" transform="rotate(60 7 14.9)" />
        <ellipse cx="17" cy="9.1" rx="2.6" ry="1.7" transform="rotate(60 17 9.1)" />
      </>
    ),
  },
  AVAX: {
    fill: '#e84142',
    glyph: <path d="M12 5.4 19 18h-4.2L12 12.8 9.2 18H5z" />,
  },
  POL: {
    // Dua segi enam bertaut. LINK juga bersegi enam, jadi yang membedakan harus
    // siluetnya — dua bidang padat lawan satu bingkai berongga — bukan warnanya.
    fill: '#8247e5',
    glyph: (
      <>
        <path d="M8.6 6.2 12.4 8.4v4.4L8.6 15 4.8 12.8V8.4z" />
        <path d="M15.4 9 19.2 11.2v4.4L15.4 17.8l-3.8-2.2v-4.4z" opacity="0.8" />
      </>
    ),
  },
  LINK: {
    fill: '#2a5ada',
    glyph: (
      <path d="M12 4.2 18.8 8v8L12 19.8 5.2 16V8zm0 2.8L7.6 9.4v5.2L12 17l4.4-2.4V9.4z" />
    ),
  },
  DOGE: {
    fill: '#c2a633',
    glyph: (
      <>
        <path d="M8.2 5.6h4.2a6.4 6.4 0 0 1 0 12.8H8.2v-4.1h3.6a2.3 2.3 0 0 0 0-4.6H8.2z" />
        <rect x="5.6" y="10.6" width="6.2" height="2.6" rx="0.4" />
      </>
    ),
  },
  TRX: {
    fill: '#eb0029',
    glyph: <path d="M4.6 5.8 19.4 9l-8.2 10.2zm2.8 2.1 3.6 8.9 4.6-5.7z" />,
  },
}

// ---------------------------------------------------------------------------
// Emas
// ---------------------------------------------------------------------------

/**
 * Tiga jalur emas dibedakan warnanya, bukan bentuknya.
 *
 * Ketiganya melacak logam yang sama, jadi lambang yang berbeda bentuk justru
 * menyesatkan. Yang berbeda adalah penerbitnya — kontrak berjangka, PAX, dan
 * Tether — dan itulah yang dibedakan lewat rona.
 */
function GoldBar({ fill, size, label }: { fill: string; size: number; label?: string }) {
  return (
    <Token fill={fill} size={size} label={label}>
      <path d="M7.2 9.4h9.6l1.5 3.1H5.7z" />
      <path d="M5.2 13.5h13.6l1.2 2.5H4z" opacity="0.8" />
      <path d="M9 6.4h6l1 2H8z" opacity="0.6" />
    </Token>
  )
}

const GOLD: Record<string, string> = {
  // Logam itu sendiri: perunggu tua, paling gelap dari ketiganya.
  'GC=F': '#a9741a',
  // PAX: emas terang.
  PAXG: '#ffc94d',
  // Tether: hijau mereknya. Jaraknya jauh dari dua yang lain dengan sengaja —
  // tiga rona emas yang berdekatan tidak terbedakan pada enam belas piksel.
  XAUT: '#26a17b',
}

// ---------------------------------------------------------------------------

/** Buang akhiran pasangan dan penanda bursa agar cocok dengan kunci di atas. */
function baseSymbol(symbol: string): string {
  return symbol.replace(/USDT$/, '').replace(/\.JK$/, '').replace(/^\^/, '')
}

/**
 * Warna monogram diturunkan dari simbolnya sendiri, bukan diacak.
 *
 * Warna yang diacak tiap render membuat baris yang sama berganti rupa tiap kali
 * halaman dimuat, dan mata berhenti memakainya sebagai penanda. Yang dipakai
 * adalah rona tetap dari hasil hash simbol: satu aset selalu mendapat warna
 * yang sama, seumur hidup daftar ini.
 */
function monogramFill(symbol: string): string {
  let hash = 0
  for (const ch of symbol) hash = (hash * 31 + ch.charCodeAt(0)) % 360
  return `hsl(${hash} 42% 42%)`
}

export function AssetIcon({ symbol, size = 16, label }: AssetIconProps) {
  const base = baseSymbol(symbol)

  const gold = GOLD[base]
  if (gold) return <GoldBar fill={gold} size={size} label={label} />

  const mark = MARKS[base]
  if (mark) {
    return (
      <Token fill={mark.fill} size={size} label={label}>
        {mark.glyph}
      </Token>
    )
  }

  // Monogram: satu atau dua huruf pertama yang bukan angka.
  const letters = base.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() || '?'

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      style={{ flex: 'none', display: 'block' }}
    >
      <circle cx="12" cy="12" r="12" fill={monogramFill(base)} />
      <text
        x="12"
        y="12"
        textAnchor="middle"
        dominantBaseline="central"
        fill="#fff"
        fontSize={letters.length > 1 ? 10 : 13}
        fontWeight={600}
        // Tumpukan font sistem, bukan font khusus: monogram tidak boleh menunggu
        // berkas font selesai diunduh untuk bisa terbaca.
        fontFamily="ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
        letterSpacing="-0.5"
      >
        {letters}
      </text>
    </svg>
  )
}
