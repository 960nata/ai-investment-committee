/**
 * Pengenal serangan.
 *
 * Seluruh berkas ini sengaja tidak menyentuh Redis, basis data, maupun jaringan.
 * Alasannya soal urutan biaya: pemindai otomatis mengirim ribuan permintaan
 * sampah, dan kalau tiap permintaan sampah itu harus menghabiskan satu perintah
 * Redis hanya untuk diketahui sampah, penyerang tetap menang — bukan dengan
 * menembus apa pun, melainkan dengan menghabiskan kuota pemeriksanya sendiri.
 *
 * Karena itu pemeriksaan di sini murni pencocokan pola terhadap alamat, string
 * kueri, dan header yang sudah ada di tangan. Gratis, selesai dalam mikrodetik,
 * dan menyaring sebagian besar lalu lintas jahat sebelum satu pun perintah
 * berbayar dikeluarkan. Yang lolos dari sini baru berhadapan dengan pembatas
 * laju di `ratelimit.ts` dan daftar blokir di `blocklist.ts`.
 *
 * Satu hal yang TIDAK dilakukan di sini: membaca badan permintaan. Membacanya
 * di proxy akan menghabiskan aliran yang dibutuhkan route di belakangnya, dan
 * route-nya akan menerima badan kosong. Pemeriksaan badan adalah urusan route,
 * lewat skema zod-nya masing-masing.
 */

/** Kode alasan yang stabil. Dipakai untuk pencatatan dan penghitungan. */
export type SignalCode =
  | 'scanner-path'
  | 'attack-tool'
  | 'injection'
  | 'traversal'
  | 'automation'
  | 'no-user-agent'

export type Verdict = 'allow' | 'suspect' | 'block'

export interface Inspection {
  verdict: Verdict
  reason: SignalCode | null
  /** Potongan bukti yang sudah dipangkas — aman untuk masuk log. */
  evidence: string | null
}

const ALLOWED: Inspection = { verdict: 'allow', reason: null, evidence: null }

/**
 * Nama segmen yang tidak pernah diminta pengunjung sungguhan.
 *
 * Proyek ini tidak punya satu baris PHP, tidak punya WordPress, dan tidak punya
 * panel admin basis data. Permintaan ke nama-nama ini bukan kesalahan ketik —
 * ia hanya bisa datang dari perkakas yang sedang mencari celah.
 *
 * Dicocokkan per segmen alamat, bukan sebagai potongan teks di mana pun. Bedanya
 * bukan soal kerapian: `whm` dan `pma` sebagai potongan teks akan ikut menolak
 * judul warta yang kebetulan memuatnya, dan artikel yang menghilang karena tiga
 * huruf di judulnya adalah kerusakan yang sangat sulit ditelusuri kembali ke
 * berkas ini.
 */
const SCANNER_SEGMENTS = new Set([
  // WordPress dan kerabatnya — sasaran pemindaian paling ramai di internet.
  'xmlrpc.php', 'wlwmanifest.xml',
  // Panel dan konsol.
  'phpmyadmin', 'pma', 'myadmin', 'adminer', 'phppgadmin', 'webadmin', 'cpanel', 'whm', 'plesk',
  // Rahasia yang tanpa sengaja ikut ter-deploy.
  'id_rsa', 'credentials', 'secrets.json', 'appsettings.json', 'web.config', 'config.json',
  // Kerangka kerja lain beserta endpoint diagnostiknya.
  'actuator', 'jsonws', 'struts', 'jenkins', 'telescope', 'solr',
  'server-status', 'server-info', '_ignition', '_profiler',
  // Surel dan direktori.
  'autodiscover', 'owa', 'ews',
  // Celah perangkat jaringan.
  'hnap1', 'boaform', 'gponform', 'cgi-bin', 'luci', 'shell',
  // Cadangan yang tertinggal di akar situs.
  'backup.sql', 'dump.sql', 'database.sql', 'backup.zip', 'www.zip', 'backup.tar.gz',
])

/**
 * Berkas titik, minus yang memang punya alasan berada di akar situs.
 *
 * Aturan "segmen apa pun yang diawali titik" jauh lebih luas daripada daftar
 * nama — ia sekaligus menutup `.env`, `.git`, `.svn`, `.aws`, `.ssh`,
 * `.htaccess`, dan berkas titik apa pun yang belum terpikirkan hari ini.
 * Pengecualiannya sedikit, dan semuanya standar.
 */
const ALLOWED_DOT_SEGMENTS = new Set(['.well-known'])

/**
 * Akhiran berkas yang tidak pernah disajikan situs ini.
 *
 * Next menyajikan halaman dan berkas statis di `public/`; tidak satu pun berakhiran
 * `.php` atau `.asp`. Permintaan yang memintanya sedang menebak tumpukan teknologi
 * lain, dan tebakan itu selalu bagian dari pemindaian.
 */
const SCANNER_EXTENSIONS = /\.(php\d?|phtml|asp|aspx|jsp|jspx|cgi|pl|cfm|bak|old|sql|swp|env)$/i

/** Benar bila alamat ini hanya masuk akal sebagai pemindaian. */
function looksLikeScan(pathname: string): boolean {
  if (SCANNER_EXTENSIONS.test(pathname)) return true

  for (const segment of pathname.toLowerCase().split('/')) {
    if (!segment) continue
    if (segment.startsWith('wp-')) return true
    if (segment.startsWith('.') && !ALLOWED_DOT_SEGMENTS.has(segment)) return true
    if (SCANNER_SEGMENTS.has(segment)) return true
  }

  return false
}

/**
 * Perkakas yang tidak punya pemakaian sah di sini.
 *
 * Berbeda dari daftar otomasi di bawah, tidak ada skenario jujur yang berakhir
 * dengan sqlmap menunjuk ke situs ini. Menyebut dirinya sendiri di header adalah
 * kesopanan yang tidak perlu dibalas.
 */
const ATTACK_TOOLS =
  /(sqlmap|nikto|nmap|masscan|zgrab|zmeu|dirbuster|gobuster|feroxbuster|ffuf|wfuzz|wpscan|joomscan|droopescan|acunetix|nessus|openvas|nuclei|havij|arachni|metasploit|hydra|medusa|commix|xsser|whatweb|netsparker|qualys|paros|w3af|skipfish|jaeles|dalfox)/i

/**
 * Klien otomatis yang punya pemakaian sah, tapi bukan di jalur mahal.
 *
 * `curl` di endpoint publik mungkin cuma seseorang yang penasaran. `curl` yang
 * memanggil rapat komite tiga ratus kali adalah hal lain. Karena itu daftar ini
 * tidak pernah memblokir sendiri — ia hanya memblokir ketika pemanggilnya
 * menyentuh jalur yang menghabiskan kuota model, dan itu diputuskan pemanggil
 * lewat opsi `strict`.
 */
const AUTOMATION =
  /(python-requests|python-urllib|aiohttp|httpx|curl\/|wget|libwww|lwp::|go-http-client|okhttp|java\/|apache-httpclient|axios\/|node-fetch|got\/|guzzle|scrapy|mechanize|phantomjs|headlesschrome|puppeteer|playwright|selenium|postmanruntime|insomnia)/i

/**
 * Pola muatan serangan.
 *
 * Dicocokkan ke alamat dan string kueri yang sudah didekode. Parameter sah di
 * API ini hanya berisi kode instrumen, kode pasar, siput warta, dan rentang
 * tanggal — tidak satu pun butuh tanda kutip, kurung siku, atau kata kunci SQL.
 * Itulah yang membuat pola seagresif ini aman di sini dan belum tentu aman di
 * proyek lain.
 */
const PAYLOAD_SIGNATURES: Array<{ code: SignalCode; pattern: RegExp }> = [
  // Suntikan SQL.
  { code: 'injection', pattern: /union[\s/*]+select/i },
  { code: 'injection', pattern: /\bor\b\s*['"]?\s*\d+\s*=\s*\d+/i },
  { code: 'injection', pattern: /(information_schema|pg_sleep|xp_cmdshell|waitfor\s+delay|benchmark\s*\(|sleep\s*\(\s*\d)/i },
  { code: 'injection', pattern: /;\s*(drop|delete|insert|update|truncate|alter)\s+(table|from|into|database)/i },
  // Suntikan skrip.
  { code: 'injection', pattern: /<\s*(script|iframe|object|embed|svg)\b/i },
  { code: 'injection', pattern: /\bon(error|load|click|mouseover|focus)\s*=/i },
  { code: 'injection', pattern: /javascript\s*:/i },
  { code: 'injection', pattern: /document\.(cookie|location)/i },
  // Suntikan lewat templat dan pencarian direktori — Log4Shell dan kerabatnya.
  { code: 'injection', pattern: /\$\{\s*(jndi|env|sys|script)\s*:/i },
  // Suntikan kueri basis data dokumen.
  { code: 'injection', pattern: /\$(ne|gt|lt|where|regex|expr)\b/i },
  // Perintah sistem.
  { code: 'injection', pattern: /[;|`]\s*(cat|ls|id|whoami|uname|curl|wget|nc|bash|sh|powershell)\s/i },
  { code: 'injection', pattern: /\$\(\s*\w/ },
  // Penelusuran direktori.
  { code: 'traversal', pattern: /(\.\.[/\\]){2,}/ },
  { code: 'traversal', pattern: /(%2e%2e[%2f5c/\\]|\.\.%2f)/i },
  { code: 'traversal', pattern: /(\/etc\/(passwd|shadow|hosts)|\/proc\/self\/|c:\\+windows\\)/i },
  // Bita nol: tidak pernah ada di masukan yang jujur, sering ada di usaha
  // memotong pemeriksaan akhiran berkas.
  { code: 'traversal', pattern: /%00|\x00/ },
]

/** Pangkas bukti supaya log tidak ikut membesar oleh muatan yang panjang. */
function trim(value: string): string {
  const flat = value.replace(/\s+/g, ' ').trim()
  return flat.length > 120 ? `${flat.slice(0, 117)}...` : flat
}

/**
 * Dekode alamat sejauh mungkin tanpa melempar.
 *
 * Penyerang menyandikan muatannya berlapis justru supaya pencocokan pola
 * meleset. Dua putaran dekode sudah menutup lapisan yang lazim; lebih dari itu
 * mulai membuka pintu untuk permintaan yang sengaja dibuat mahal didekode.
 */
function decodeTwice(value: string): string {
  let current = value
  for (let round = 0; round < 2; round++) {
    try {
      const next = decodeURIComponent(current)
      if (next === current) break
      current = next
    } catch {
      break
    }
  }
  return current
}

export interface InspectOptions {
  /**
   * Benar untuk jalur yang menghabiskan kuota model atau menerima kredensial.
   * Di jalur itu, klien otomatis ikut diblokir, bukan sekadar dicurigai.
   */
  strict?: boolean
}

/**
 * Periksa satu permintaan.
 *
 * Urutannya dari yang paling pasti ke yang paling samar, dan berhenti di
 * temuan pertama. Yang pasti lebih dulu bukan demi kecepatan, melainkan supaya
 * alasan yang tercatat adalah alasan yang paling menjelaskan — sebuah permintaan
 * sqlmap ke `/wp-admin` lebih berguna dicatat sebagai perkakas serangan
 * daripada sebagai alamat pemindai.
 */
export function inspect(request: Request, options: InspectOptions = {}): Inspection {
  const userAgent = request.headers.get('user-agent') ?? ''

  if (userAgent && ATTACK_TOOLS.test(userAgent)) {
    return { verdict: 'block', reason: 'attack-tool', evidence: trim(userAgent) }
  }

  let url: URL
  try {
    url = new URL(request.url)
  } catch {
    return ALLOWED
  }

  const path = decodeTwice(url.pathname)
  const query = decodeTwice(url.search)

  if (looksLikeScan(path)) {
    return { verdict: 'block', reason: 'scanner-path', evidence: trim(path) }
  }

  const surface = `${path}${query}`
  for (const { code, pattern } of PAYLOAD_SIGNATURES) {
    if (pattern.test(surface)) {
      return { verdict: 'block', reason: code, evidence: trim(surface) }
    }
  }

  // Sisanya hanya berlaku untuk jalur mahal. Di jalur biasa, klien tanpa agen
  // peramban paling sering adalah pemeriksa kesehatan, pratinjau tautan, atau
  // seseorang dengan curl — tidak ada yang perlu dihalangi.
  if (!options.strict) return ALLOWED

  if (!userAgent) {
    return { verdict: 'block', reason: 'no-user-agent', evidence: null }
  }

  if (AUTOMATION.test(userAgent)) {
    return { verdict: 'block', reason: 'automation', evidence: trim(userAgent) }
  }

  return ALLOWED
}

/** Kalimat yang dilihat pemanggil. Sengaja sama untuk semua alasan. */
export const BLOCK_MESSAGE = 'Permintaan ditolak.'

/**
 * Penjelasan tiap kode untuk layar admin.
 *
 * Disimpan di sini, bukan di komponennya, supaya kode baru yang ditambahkan ke
 * daftar sinyal tidak bisa muncul di layar tanpa keterangan.
 */
export const SIGNAL_LABELS: Record<SignalCode, string> = {
  'scanner-path': 'Pemindaian alamat',
  'attack-tool': 'Perkakas serangan',
  injection: 'Percobaan suntikan',
  traversal: 'Penelusuran direktori',
  automation: 'Klien otomatis di jalur mahal',
  'no-user-agent': 'Tanpa identitas peramban',
}
