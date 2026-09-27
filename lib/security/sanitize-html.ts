/**
 * Sanitasi HTML isi warta — daftar izin, bukan daftar larangan.
 *
 * Isi warta ditulis model bahasa, dan warta otomatis menulisnya dari halaman
 * situs luar. Halaman itu bisa menyelipkan instruksi yang membuat model
 * menulis HTML berbahaya (`<img src=x onerror=...>`, `<a href="javascript:">`),
 * dan hasilnya dirender lewat `dangerouslySetInnerHTML` di portal publik.
 *
 * Pendekatan larangan (buang <script>, buang on*="...") selalu kalah satu
 * langkah: atribut tanpa tanda kutip, entitas, atau tag yang terlupa lolos.
 * Di sini sebaliknya — hanya tag dan atribut di daftar yang dipertahankan,
 * setiap atribut ditulis ulang dari nilai yang sudah diperiksa, dan URL hanya
 * boleh http(s) atau jangkar internal.
 *
 * Murni string, tanpa DOM, supaya sama persis di server (sebelum disimpan)
 * dan di peramban (sebelum dirender).
 */

/** Tag yang isinya ikut dibuang, bukan hanya tagnya. */
const DROP_WITH_CONTENT = [
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'noscript',
  'template',
  'svg',
  'math',
  'form',
  'textarea',
  'select',
  'button',
  'title',
  'head',
  'frameset',
  'frame',
  'applet',
]

const ALLOWED_TAGS = new Set([
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'br', 'hr', 'div', 'span',
  'strong', 'b', 'em', 'i', 'u', 's', 'mark', 'small', 'sub', 'sup',
  'code', 'pre', 'blockquote', 'q', 'cite',
  'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption',
  'a', 'figure', 'figcaption',
])

/** Atribut yang boleh dipertahankan, per tag. `*` berlaku untuk semua tag. */
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  '*': new Set(['title', 'class']),
  a: new Set(['href', 'target', 'rel']),
  th: new Set(['colspan', 'rowspan', 'scope', 'align']),
  td: new Set(['colspan', 'rowspan', 'align']),
  ol: new Set(['start']),
}

const VOID_TAGS = new Set(['br', 'hr'])

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Dekode entitas supaya "jav&#x61;script:" tidak lolos pemeriksaan skema. */
function decodeForCheck(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);?/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&#(\d+);?/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&colon;/gi, ':')
    .replace(/&tab;|&newline;/gi, '')
    .replace(/&amp;/gi, '&')
    // Spasi dan karakter kendali di dalam skema diabaikan peramban.
    .replace(/[\u0000- \u007f-\u009f]/g, '')
}

export function isSafeUrl(raw: string): boolean {
  const value = decodeForCheck(raw.trim())
  if (value === '') return false
  if (value.startsWith('#') || (value.startsWith('/') && !value.startsWith('//'))) return true
  return /^https?:\/\//i.test(value)
}

function parseAttributes(source: string): Array<[string, string]> {
  const attrs: Array<[string, string]> = []
  const pattern = /([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(source)) !== null) {
    attrs.push([match[1].toLowerCase(), match[2] ?? match[3] ?? match[4] ?? ''])
  }
  return attrs
}

function rebuildTag(name: string, attrSource: string, selfClosing: boolean): string {
  const allowed = ALLOWED_ATTRS[name]
  const kept: string[] = []

  for (const [attr, value] of parseAttributes(attrSource)) {
    if (!ALLOWED_ATTRS['*'].has(attr) && !allowed?.has(attr)) continue

    if (attr === 'href') {
      if (!isSafeUrl(value)) continue
    } else if (attr === 'target') {
      if (value !== '_blank') continue
    } else if (attr === 'colspan' || attr === 'rowspan' || attr === 'start') {
      if (!/^\d{1,3}$/.test(value)) continue
    } else if (attr === 'scope') {
      if (!/^(row|col|rowgroup|colgroup)$/.test(value)) continue
    } else if (attr === 'align') {
      if (!/^(left|right|center)$/i.test(value)) continue
    } else if (attr === 'class') {
      if (!/^[\w\s-]{1,120}$/.test(value)) continue
    } else if (attr === 'rel') {
      if (!/^[a-z\s]+$/i.test(value)) continue
    }

    kept.push(`${attr}="${escapeAttr(value)}"`)
  }

  // Tautan keluar selalu memutus akses ke window portal.
  if (name === 'a' && kept.some((a) => a.startsWith('target='))) {
    const rel = kept.findIndex((a) => a.startsWith('rel='))
    if (rel !== -1) kept.splice(rel, 1)
    kept.push('rel="noopener noreferrer nofollow"')
  }

  const attrs = kept.length > 0 ? ` ${kept.join(' ')}` : ''
  return VOID_TAGS.has(name) || selfClosing ? `<${name}${attrs} />` : `<${name}${attrs}>`
}

/**
 * Bersihkan potongan HTML/Markdown campuran. Teks biasa dan sintaks Markdown
 * tidak disentuh; hanya tag yang diperiksa.
 */
export function sanitizeHtml(input: string): string {
  if (!input) return ''

  let text = input.replace(/<!--[\s\S]*?-->/g, '')

  for (const tag of DROP_WITH_CONTENT) {
    text = text.replace(new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}\\s*>`, 'gi'), '')
    // Tag pembuka tanpa penutup ikut dibuang sendirian.
    text = text.replace(new RegExp(`<\\/?${tag}\\b[^>]*>`, 'gi'), '')
  }

  return text.replace(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (_, closing: string, rawName: string, rest: string) => {
    const name = rawName.toLowerCase()
    if (!ALLOWED_TAGS.has(name)) return ''
    if (closing) return VOID_TAGS.has(name) ? '' : `</${name}>`
    const selfClosing = /\/\s*$/.test(rest)
    return rebuildTag(name, rest.replace(/\/\s*$/, ''), selfClosing)
  })
}
