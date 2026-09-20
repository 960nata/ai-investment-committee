/**
 * Set ikon.
 *
 * Digambar sendiri sebagai SVG, bukan emoji. Emoji dirender berbeda di tiap
 * sistem operasi, ukurannya tidak bisa dikendalikan, warnanya tidak bisa
 * mengikuti teks, dan nadanya ceria — tiga hal yang salah untuk alat ukur.
 *
 * Semuanya satu bahasa: kotak 24, goresan 1,5, tanpa isian, mewarisi
 * `currentColor`. Bentuknya sengaja skematis seperti simbol di panel alat,
 * bukan ilustrasi.
 */

interface IconProps {
  size?: number
  className?: string
  style?: React.CSSProperties
  /**
   * Isi hanya bila ikon berdiri sendiri tanpa teks pendamping. Ikon yang
   * ditemani label justru harus disembunyikan dari pembaca layar supaya
   * namanya tidak terbaca dua kali.
   */
  title?: string
}

function Svg({ size = 20, className, style, title, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
    >
      {title && <title>{title}</title>}
      {children}
    </svg>
  )
}

/** Jarum ukur pada busur — halaman ringkasan keadaan mesin. */
export function IconGauge(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3.5 17a9 9 0 1 1 17 0" />
      <path d="M12 17 16.5 9.5" />
      <circle cx="12" cy="17" r="1.25" />
      <path d="M3.5 17h2M18.5 17h2M12 5.5v1.5" />
    </Svg>
  )
}

/** Deretan baris data — daftar instrumen. */
export function IconRows(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3.5 6.5h17M3.5 12h17M3.5 17.5h17" />
      <path d="M3.5 6.5v0M3.5 12v0M3.5 17.5v0" />
      <circle cx="7" cy="6.5" r="0.9" />
      <circle cx="11" cy="12" r="0.9" />
      <circle cx="15" cy="17.5" r="0.9" />
    </Svg>
  )
}

/** Percabangan aliran kerja — halaman pipeline. */
export function IconFlow(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="5" cy="12" r="2" />
      <circle cx="19" cy="6" r="2" />
      <circle cx="19" cy="18" r="2" />
      <path d="M7 12h4a2 2 0 0 0 2-2V8a2 2 0 0 1 2-2h2" />
      <path d="M7 12h4a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2h2" />
    </Svg>
  )
}

/** Tumpukan penyimpanan. */
export function IconDatabase(props: IconProps) {
  return (
    <Svg {...props}>
      <ellipse cx="12" cy="6" rx="7" ry="2.75" />
      <path d="M5 6v12c0 1.5 3.1 2.75 7 2.75s7-1.25 7-2.75V6" />
      <path d="M5 12c0 1.5 3.1 2.75 7 2.75s7-1.25 7-2.75" />
    </Svg>
  )
}

/** Lilin harga dengan sumbunya. */
export function IconCandles(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M7.5 3.5v3M7.5 15.5v5" />
      <rect x="5.5" y="6.5" width="4" height="9" rx="0.75" />
      <path d="M16.5 3.5v6M16.5 16.5v4" />
      <rect x="14.5" y="9.5" width="4" height="7" rx="0.75" />
    </Svg>
  )
}

/** Steker — adaptor sumber data. */
export function IconPlug(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9 3.5v4M15 3.5v4" />
      <path d="M6 7.5h12v3a6 6 0 0 1-6 6 6 6 0 0 1-6-6z" />
      <path d="M12 16.5v4" />
    </Svg>
  )
}

/** Tabung uji — baris yang dikarantina. */
export function IconFlask(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9.5 3.5h5" />
      <path d="M10.5 3.5v6L5.8 17.6A2 2 0 0 0 7.5 20.5h9a2 2 0 0 0 1.7-2.9L13.5 9.5v-6" />
      <path d="M8.2 14h7.6" />
    </Svg>
  )
}

/** Jam — kesegaran data. */
export function IconClock(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5.2l3.2 2" />
    </Svg>
  )
}

/** Gelombang denyut — kesehatan pipeline. */
export function IconPulse(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2.5 12h4l2.5-6.5 4 13L15.5 12h6" />
    </Svg>
  )
}

/** Antrian pekerjaan. */
export function IconQueue(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3.5" y="4.5" width="17" height="4.5" rx="1.25" />
      <rect x="3.5" y="11" width="17" height="4.5" rx="1.25" />
      <path d="M6.5 18.5h11" />
    </Svg>
  )
}

/** Centang — keadaan terverifikasi. */
export function IconCheck(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />
    </Svg>
  )
}

/** Segitiga peringatan. */
export function IconAlert(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 4.5 21 19.5H3z" />
      <path d="M12 10v4" />
      <path d="M12 16.75v.01" />
    </Svg>
  )
}

/** Panah berputar — muat ulang. */
export function IconRefresh(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20 12a8 8 0 1 1-2.6-5.9" />
      <path d="M20.5 4v4.5H16" />
    </Svg>
  )
}

/** Petir — memicu pekerjaan sekarang. */
export function IconBolt(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M13.5 3 5.5 13.5h5l-1 7.5 8-10.5h-5z" />
    </Svg>
  )
}

/** Perisai — bagian keamanan. */
export function IconShield(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3.5 5 6.2v5.1c0 4.3 2.9 7.8 7 9.2 4.1-1.4 7-4.9 7-9.2V6.2z" />
      <path d="M9.2 12.2 11.3 14.3 15 10.5" />
    </Svg>
  )
}

/** Panah kanan. */
export function IconArrowRight(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4.5 12h15" />
      <path d="M13.5 6l6 6-6 6" />
    </Svg>
  )
}

/** Garis waktu berjadwal. */
export function IconSchedule(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3.5" y="5.5" width="17" height="15" rx="1.75" />
      <path d="M3.5 10h17" />
      <path d="M8 3.5v4M16 3.5v4" />
      <path d="M8 14h3M8 17h6" />
    </Svg>
  )
}

/** Lapisan — set fitur terhitung. */
export function IconLayers(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3.5 21 8l-9 4.5L3 8z" />
      <path d="M3 12.5 12 17l9-4.5" />
      <path d="M3 17 12 21.5 21 17" />
    </Svg>
  )
}

/** Surat kabar / warta intelijen pasar. */
export function IconNews(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 20h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v13a2 2 0 0 1-2 2H3" />
      <path d="M8 7h8M8 11h8M8 15h5" />
      <path d="M4 20a2 2 0 0 1-2-2V7" />
    </Svg>
  )
}

/** Gedung sidang / komite institusional. */
export function IconCourt(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 21h18" />
      <path d="M5 21V10" />
      <path d="M9 21V10" />
      <path d="M15 21V10" />
      <path d="M19 21V10" />
      <path d="M12 3 3 8h18z" />
    </Svg>
  )
}

/** Bidikan sasaran / strategis portofolio. */
export function IconTarget(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.5" />
    </Svg>
  )
}

/** Neraca timbangan keadilan / ketua komite. */
export function IconScales(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3v18" />
      <path d="M5 6h14" />
      <path d="M5 6l-3 7h6z" />
      <path d="M19 6l-3 7h6z" />
      <path d="M9 21h6" />
    </Svg>
  )
}

/** Gelembung pesan / debat agen. */
export function IconChat(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </Svg>
  )
}

/** Salin berkas / teks. */
export function IconCopy(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="8.5" y="8.5" width="11" height="11" rx="1.5" />
      <path d="M5.5 15.5H4a1.5 1.5 0 0 1-1.5-1.5V4a1.5 1.5 0 0 1 1.5-1.5h10A1.5 1.5 0 0 1 15.5 4v1.5" />
    </Svg>
  )
}

/** Tanda silang tutup / batal. */
export function IconClose(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M18 6 6 18M6 6l12 12" />
    </Svg>
  )
}

/** Tren naik / sentimen beli. */
export function IconTrendUp(props: IconProps) {
  return (
    <Svg {...props}>
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </Svg>
  )
}

/** Tren turun / sentimen jual. */
export function IconTrendDown(props: IconProps) {
  return (
    <Svg {...props}>
      <polyline points="22 17 13.5 8.5 8.5 13.5 2 7" />
      <polyline points="16 17 22 17 22 11" />
    </Svg>
  )
}

/** Segitiga jalankan / play sidang. */
export function IconPlay(props: IconProps) {
  return (
    <Svg {...props}>
      <polygon points="6 4 19 12 6 20 6 4" fill="currentColor" stroke="none" />
    </Svg>
  )
}

