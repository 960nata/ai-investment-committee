/**
 * Bendera negara sebagai SVG.
 *
 * Digambar sendiri, bukan emoji. Emoji bendera tidak dirender sama sekali di
 * Windows, muncul sebagai dua huruf kode negara — yang berarti daftar indeks
 * dunia akan terbaca sebagai deretan "ID US JP" di sebagian besar mesin.
 *
 * Bentuknya sengaja disederhanakan. Pada ukuran enam belas piksel, lambang yang
 * rumit berubah jadi noda; yang menentukan pengenalan hanya susunan warna dan
 * bidangnya. Yang dikejar di sini "langsung tertebak sekilas", bukan "tepat
 * secara heraldik".
 */

const RATIO = { width: 21, height: 14 }

function Flag({
  label,
  size = 14,
  children,
}: {
  label: string
  size?: number
  children: React.ReactNode
}) {
  return (
    <svg
      width={(size * RATIO.width) / RATIO.height}
      height={size}
      viewBox="0 0 21 14"
      role="img"
      aria-label={`Bendera ${label}`}
      style={{ borderRadius: 1, flex: 'none', display: 'block' }}
    >
      {children}
      {/* Garis tepi tipis supaya bendera berlatar putih tidak lenyap. */}
      <rect x="0.25" y="0.25" width="20.5" height="13.5" fill="none" stroke="rgba(0,0,0,0.25)" strokeWidth="0.5" />
    </svg>
  )
}

const W = '#ffffff'

function Bands({ colours, vertical = false }: { colours: string[]; vertical?: boolean }) {
  const span = vertical ? 21 / colours.length : 14 / colours.length
  return (
    <>
      {colours.map((c, i) => (
        <rect
          key={i}
          x={vertical ? i * span : 0}
          y={vertical ? 0 : i * span}
          width={vertical ? span : 21}
          height={vertical ? 14 : span}
          fill={c}
        />
      ))}
    </>
  )
}

export function FlagIndonesia(p: { size?: number }) {
  return <Flag label="Indonesia" {...p}><Bands colours={['#e01e26', W]} /></Flag>
}

export function FlagUnitedStates(p: { size?: number }) {
  return (
    <Flag label="Amerika Serikat" {...p}>
      <rect width="21" height="14" fill={W} />
      {[0, 2, 4, 6].map((i) => (
        <rect key={i} y={i * 2.15} width="21" height="1.08" fill="#b22234" />
      ))}
      {[1, 3, 5].map((i) => (
        <rect key={i} y={i * 2.15} width="21" height="1.08" fill="#b22234" />
      ))}
      <rect width="9" height="7.5" fill="#3c3b6e" />
    </Flag>
  )
}

export function FlagJapan(p: { size?: number }) {
  return (
    <Flag label="Jepang" {...p}>
      <rect width="21" height="14" fill={W} />
      <circle cx="10.5" cy="7" r="4.2" fill="#bc002d" />
    </Flag>
  )
}

export function FlagChina(p: { size?: number }) {
  return (
    <Flag label="China" {...p}>
      <rect width="21" height="14" fill="#de2910" />
      <path d="M4.6 2.2 5.5 4.9 3.2 3.2h2.8L3.7 4.9z" fill="#ffde00" />
      <circle cx="8.6" cy="1.9" r="0.6" fill="#ffde00" />
      <circle cx="10" cy="3.5" r="0.6" fill="#ffde00" />
      <circle cx="10" cy="5.6" r="0.6" fill="#ffde00" />
      <circle cx="8.6" cy="7.1" r="0.6" fill="#ffde00" />
    </Flag>
  )
}

export function FlagHongKong(p: { size?: number }) {
  return (
    <Flag label="Hong Kong" {...p}>
      <rect width="21" height="14" fill="#de2910" />
      {[0, 72, 144, 216, 288].map((deg) => (
        <ellipse
          key={deg}
          cx="10.5"
          cy="3.6"
          rx="1.05"
          ry="3.4"
          fill={W}
          transform={`rotate(${deg} 10.5 7)`}
        />
      ))}
    </Flag>
  )
}

export function FlagSingapore(p: { size?: number }) {
  return (
    <Flag label="Singapura" {...p}>
      <rect width="21" height="7" fill="#ed2939" />
      <rect y="7" width="21" height="7" fill={W} />
      <circle cx="5" cy="3.5" r="2.4" fill={W} />
      <circle cx="6.1" cy="3.5" r="2.1" fill="#ed2939" />
    </Flag>
  )
}

export function FlagMalaysia(p: { size?: number }) {
  return (
    <Flag label="Malaysia" {...p}>
      <rect width="21" height="14" fill={W} />
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <rect key={i} y={i * 2} width="21" height="1" fill="#cc0001" />
      ))}
      <rect width="11" height="8" fill="#010066" />
      <circle cx="4.6" cy="4" r="2.3" fill="#ffcc00" />
      <circle cx="5.6" cy="4" r="2" fill="#010066" />
    </Flag>
  )
}

export function FlagThailand(p: { size?: number }) {
  return (
    <Flag label="Thailand" {...p}>
      <rect width="21" height="14" fill="#a51931" />
      <rect y="2.33" width="21" height="9.34" fill={W} />
      <rect y="4.66" width="21" height="4.68" fill="#2d2a4a" />
    </Flag>
  )
}

export function FlagSouthKorea(p: { size?: number }) {
  return (
    <Flag label="Korea Selatan" {...p}>
      <rect width="21" height="14" fill={W} />
      <path d="M10.5 3.5a3.5 3.5 0 0 1 0 7 3.5 3.5 0 0 0 0-7z" fill="#003478" />
      <path d="M10.5 3.5a3.5 3.5 0 0 0 0 7 3.5 3.5 0 0 1 0-7z" fill="#cd2e3a" />
      <circle cx="10.5" cy="5.25" r="1.75" fill="#cd2e3a" />
      <circle cx="10.5" cy="8.75" r="1.75" fill="#003478" />
    </Flag>
  )
}

export function FlagTaiwan(p: { size?: number }) {
  return (
    <Flag label="Taiwan" {...p}>
      <rect width="21" height="14" fill="#fe0000" />
      <rect width="10.5" height="7" fill="#000095" />
      <circle cx="5.25" cy="3.5" r="2" fill={W} />
      <circle cx="5.25" cy="3.5" r="1.2" fill="#000095" />
    </Flag>
  )
}

export function FlagIndia(p: { size?: number }) {
  return (
    <Flag label="India" {...p}>
      <Bands colours={['#ff9933', W, '#138808']} />
      <circle cx="10.5" cy="7" r="1.7" fill="none" stroke="#000088" strokeWidth="0.5" />
    </Flag>
  )
}

export function FlagAustralia(p: { size?: number }) {
  return (
    <Flag label="Australia" {...p}>
      <rect width="21" height="14" fill="#00247d" />
      <rect width="10.5" height="7" fill="#012169" />
      <path d="M0 0l10.5 7M10.5 0L0 7" stroke={W} strokeWidth="1" />
      <path d="M5.25 0v7M0 3.5h10.5" stroke={W} strokeWidth="1.8" />
      <path d="M5.25 0v7M0 3.5h10.5" stroke="#c8102e" strokeWidth="1" />
      <circle cx="15.5" cy="9" r="1" fill={W} />
      <circle cx="17.8" cy="4.5" r="0.7" fill={W} />
      <circle cx="5.2" cy="11" r="0.9" fill={W} />
    </Flag>
  )
}

export function FlagUnitedKingdom(p: { size?: number }) {
  return (
    <Flag label="Inggris" {...p}>
      <rect width="21" height="14" fill="#012169" />
      <path d="M0 0l21 14M21 0L0 14" stroke={W} strokeWidth="2.8" />
      <path d="M0 0l21 14M21 0L0 14" stroke="#c8102e" strokeWidth="1.5" />
      <path d="M10.5 0v14M0 7h21" stroke={W} strokeWidth="4.5" />
      <path d="M10.5 0v14M0 7h21" stroke="#c8102e" strokeWidth="2.6" />
    </Flag>
  )
}

export function FlagGermany(p: { size?: number }) {
  return <Flag label="Jerman" {...p}><Bands colours={['#000000', '#dd0000', '#ffce00']} /></Flag>
}

export function FlagFrance(p: { size?: number }) {
  return <Flag label="Prancis" {...p}><Bands colours={['#002395', W, '#ed2939']} vertical /></Flag>
}

export function FlagEuropeanUnion(p: { size?: number }) {
  return (
    <Flag label="Zona Euro" {...p}>
      <rect width="21" height="14" fill="#003399" />
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i * Math.PI) / 6
        return (
          <circle
            key={i}
            cx={10.5 + Math.sin(a) * 4}
            cy={7 - Math.cos(a) * 4}
            r="0.6"
            fill="#ffcc00"
          />
        )
      })}
    </Flag>
  )
}

export function FlagBrazil(p: { size?: number }) {
  return (
    <Flag label="Brasil" {...p}>
      <rect width="21" height="14" fill="#009b3a" />
      <path d="M10.5 1.6 19.4 7l-8.9 5.4L1.6 7z" fill="#fedf00" />
      <circle cx="10.5" cy="7" r="2.6" fill="#002776" />
    </Flag>
  )
}

export function FlagNetherlands(p: { size?: number }) {
  return <Flag label="Belanda" {...p}><Bands colours={['#ae1c28', W, '#21468b']} /></Flag>
}

export function FlagSwitzerland(p: { size?: number }) {
  return (
    <Flag label="Swiss" {...p}>
      <rect width="21" height="14" fill="#d52b1e" />
      <rect x="9" y="3.5" width="3" height="7" fill={W} />
      <rect x="7" y="5.5" width="7" height="3" fill={W} />
    </Flag>
  )
}

export function FlagItaly(p: { size?: number }) {
  return <Flag label="Italia" {...p}><Bands vertical colours={['#009246', W, '#ce2b37']} /></Flag>
}

export function FlagCanada(p: { size?: number }) {
  return (
    <Flag label="Kanada" {...p}>
      <rect width="21" height="14" fill="#d80621" />
      <rect x="5.25" width="10.5" height="14" fill={W} />
      <path d="M10.5 3.2 11.4 5.4l2-.6-.8 1.8 1.6.8-1.7 1.4.3 1.6-2-.8-.3 1.8-.3-1.8-2 .8.3-1.6-1.7-1.4 1.6-.8-.8-1.8 2 .6z" fill="#d80621" />
    </Flag>
  )
}

export function FlagSaudiArabia(p: { size?: number }) {
  return (
    <Flag label="Arab Saudi" {...p}>
      <rect width="21" height="14" fill="#006c35" />
      <rect x="5" y="5" width="11" height="2" fill={W} rx="0.5" />
      <path d="M5 9h11M5 9l2-1.5M5 9l2 1.5" stroke={W} strokeWidth="0.8" fill="none" />
    </Flag>
  )
}

/** Untuk aset yang tidak terikat satu negara: emas, komoditi, indeks dolar. */
export function FlagGlobal(p: { size?: number }) {
  return (
    <Flag label="Global" {...p}>
      <rect width="21" height="14" fill="#1d3a34" />
      <circle cx="10.5" cy="7" r="4.6" fill="none" stroke="#7fb3a6" strokeWidth="0.8" />
      <ellipse cx="10.5" cy="7" rx="2" ry="4.6" fill="none" stroke="#7fb3a6" strokeWidth="0.7" />
      <path d="M5.9 7h9.2M6.9 4.4h7.2M6.9 9.6h7.2" stroke="#7fb3a6" strokeWidth="0.6" />
    </Flag>
  )
}

const BY_REGION: Record<string, (p: { size?: number }) => React.ReactElement> = {
  Indonesia: FlagIndonesia,
  'Amerika Serikat': FlagUnitedStates,
  Jepang: FlagJapan,
  China: FlagChina,
  'Hong Kong': FlagHongKong,
  Singapura: FlagSingapore,
  Malaysia: FlagMalaysia,
  Thailand: FlagThailand,
  'Korea Selatan': FlagSouthKorea,
  Taiwan: FlagTaiwan,
  India: FlagIndia,
  Australia: FlagAustralia,
  Inggris: FlagUnitedKingdom,
  Jerman: FlagGermany,
  Prancis: FlagFrance,
  Belanda: FlagNetherlands,
  Swiss: FlagSwitzerland,
  Italia: FlagItaly,
  Kanada: FlagCanada,
  'Arab Saudi': FlagSaudiArabia,
  'Zona Euro': FlagEuropeanUnion,
  Brasil: FlagBrazil,
  Global: FlagGlobal,
}

/** Bendera menurut nama kawasan. Kawasan tak dikenal jatuh ke lambang global. */
export function RegionFlag({ region, size = 14 }: { region?: string | null; size?: number }) {
  const Component = (region && BY_REGION[region]) || FlagGlobal
  return <Component size={size} />
}
