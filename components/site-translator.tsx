'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { LOCALE_INFO, SOURCE_LOCALE, type Locale } from '@/lib/i18n/locales'
import { LOCALE_EVENT, localeFromPath, readPreference } from '@/lib/i18n/preference'
import { STATIC_DICTIONARY } from '@/lib/i18n/static-dictionary'

/*
 * Penerjemah halaman di peramban.
 *
 * Halaman selalu dirender server dalam Bahasa Indonesia. Bila pengunjung
 * memilih bahasa lain, komponen ini mengumpulkan teks yang tampil — termasuk
 * placeholder, title, aria-label, dan alt — mengirimnya berkelompok ke
 * /api/v1/i18n/translate, lalu menggantinya di tempat. Perubahan halaman
 * sesudahnya (menu yang dibuka, harga yang diperbarui) ikut diterjemahkan
 * lewat MutationObserver.
 *
 * Yang tidak disentuh:
 *  - angka, harga, persen, dan simbol aset (tidak dikirim sama sekali);
 *  - elemen bertanda translate="no" atau .notranslate;
 *  - bagian yang sudah ditulis dalam bahasa itu oleh server
 *    (data-native-locale), misalnya isi artikel /ja/warta/...
 *
 * Teks asli disimpan per node, jadi kembali ke Bahasa Indonesia tidak perlu
 * memuat ulang halaman.
 */

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE', 'KBD', 'TEXTAREA', 'svg'])
const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'] as const
const BATCH = 50
const STORE_LIMIT = 4000

/** Teks tanpa huruf, atau satu token yang tampak seperti simbol/angka: tidak dikirim. */
function translatable(core: string): boolean {
  if (core.length < 2 || core.length > 1000) return false
  if (!/\p{L}/u.test(core)) return false
  if (!/\s/.test(core) && /[\d.^=/]|USDT$/.test(core)) return false
  return true
}

function storeKey(locale: Locale) {
  return `komite_tr_${locale}`
}

function loadStore(locale: Locale): Map<string, string> {
  const map = new Map<string, string>()
  if (locale !== SOURCE_LOCALE && STATIC_DICTIONARY[locale as Exclude<Locale, 'id'>]) {
    for (const [k, v] of Object.entries(STATIC_DICTIONARY[locale as Exclude<Locale, 'id'>])) {
      map.set(k, v)
    }
  }
  try {
    const raw = localStorage.getItem(storeKey(locale))
    if (raw) {
      for (const [k, v] of Object.entries(JSON.parse(raw)) as [string, string][]) {
        map.set(k, v)
      }
    }
  } catch {
    // Abaikan jika localStorage tidak dapat diakses
  }
  return map
}

function saveStore(locale: Locale, map: Map<string, string>) {
  try {
    const entries = [...map.entries()].slice(-STORE_LIMIT)
    localStorage.setItem(storeKey(locale), JSON.stringify(Object.fromEntries(entries)))
  } catch {
    // Penyimpanan penuh atau diblokir — cache server tetap menutupnya.
  }
}

function excluded(el: Element | null, locale: Locale): boolean {
  if (!el) return true
  if (el.closest('[translate="no"], .notranslate')) return true
  const native = el.closest('[data-native-locale]')
  return native?.getAttribute('data-native-locale') === locale
}

export function SiteTranslator() {
  const pathname = usePathname() || '/'
  const [locale, setLocale] = useState<Locale>(SOURCE_LOCALE)
  const [busy, setBusy] = useState(false)

  const [justDone, setJustDone] = useState(false)
  const doneTimer = useRef<NodeJS.Timeout | null>(null)

  // Keadaan yang harus bertahan melewati render ulang.
  const originals = useRef(new WeakMap<Text, string>())
  const applied = useRef(new WeakMap<Text, string>())
  const attrOriginals = useRef(new WeakMap<Element, Map<string, string>>())
  const touched = useRef(new Set<WeakRef<Text>>())
  const touchedEls = useRef(new Set<WeakRef<Element>>())

  // Bahasa aktif: awalan alamat menang, lalu pilihan tersimpan.
  useEffect(() => {
    const sync = () => setLocale(localeFromPath(window.location.pathname) ?? readPreference())
    const frame = requestAnimationFrame(sync)
    const onChange = (e: Event) => setLocale((e as CustomEvent<Locale>).detail)
    window.addEventListener(LOCALE_EVENT, onChange)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener(LOCALE_EVENT, onChange)
      if (doneTimer.current) clearTimeout(doneTimer.current)
    }
  }, [pathname])

  useEffect(() => {
    document.documentElement.lang = LOCALE_INFO[locale].htmlLang

    // --- Kembali ke bahasa sumber: pulihkan semua yang pernah diganti. --------
    if (locale === SOURCE_LOCALE) {
      for (const ref of touched.current) {
        const node = ref.deref()
        const original = node && originals.current.get(node)
        if (node && original !== undefined) node.nodeValue = original
      }
      for (const ref of touchedEls.current) {
        const el = ref.deref()
        const map = el && attrOriginals.current.get(el)
        if (el && map) for (const [attr, value] of map) el.setAttribute(attr, value)
      }
      touched.current.clear()
      touchedEls.current.clear()
      originals.current = new WeakMap()
      applied.current = new WeakMap()
      attrOriginals.current = new WeakMap()
      queueMicrotask(() => {
        setBusy(false)
        setJustDone(false)
      })
      return
    }

    const cache = loadStore(locale)
    const inflight = new Set<string>()
    // Teks yang gagal diterjemahkan menunggu makin lama sebelum dicoba lagi.
    // Tanpa ini, halaman yang teksnya terus berganti (kisi harga) akan
    // meminta ulang teks yang sama tiap beberapa detik.
    const retryAt = new Map<string, { at: number; wait: number }>()
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    /** Terapkan terjemahan yang sudah ada; kembalikan teks yang belum punya. */
    const apply = (): string[] => {
      const missing = new Set<string>()
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          const parent = node.parentElement
          if (!parent || SKIP_TAGS.has(parent.tagName) || parent.closest('svg')) return NodeFilter.FILTER_REJECT
          return excluded(parent, locale) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
        },
      })

      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const node = n as Text
        const value = node.nodeValue ?? ''
        // Node yang sudah kita isi sendiri dilewati; yang diubah React sesudahnya
        // (nilai berbeda) dianggap teks asli baru.
        if (applied.current.get(node) === value) continue
        const core = value.trim()
        if (!translatable(core)) continue

        const hit = cache.get(core)
        if (hit === undefined) {
          missing.add(core)
          continue
        }
        if (!originals.current.has(node) || applied.current.get(node) !== value) {
          originals.current.set(node, value)
        }
        const lead = value.match(/^\s*/)?.[0] ?? ''
        const trail = value.match(/\s*$/)?.[0] ?? ''
        const next = lead + hit + trail
        node.nodeValue = next
        applied.current.set(node, next)
        touched.current.add(new WeakRef(node))
      }

      for (const el of document.body.querySelectorAll(ATTRS.map((a) => `[${a}]`).join(','))) {
        if (excluded(el, locale)) continue
        let map = attrOriginals.current.get(el)
        for (const attr of ATTRS) {
          const current = el.getAttribute(attr)
          if (!current) continue
          const original = map?.get(attr) ?? current
          const core = original.trim()
          if (!translatable(core)) continue
          const hit = cache.get(core)
          if (hit === undefined) {
            missing.add(core)
            continue
          }
          if (current === hit) continue
          if (!map) {
            map = new Map()
            attrOriginals.current.set(el, map)
            touchedEls.current.add(new WeakRef(el))
          }
          if (!map.has(attr)) map.set(attr, current)
          el.setAttribute(attr, hit)
        }
      }

      const now = Date.now()
      return [...missing].filter((t) => !inflight.has(t) && (retryAt.get(t)?.at ?? 0) <= now)
    }

    const backoff = (t: string) => {
      const wait = Math.min((retryAt.get(t)?.wait ?? 7_500) * 2, 600_000)
      retryAt.set(t, { at: Date.now() + wait, wait })
    }

    const fetchMissing = async (texts: string[]) => {
      if (texts.length === 0) return
      setBusy(true)
      for (const t of texts) inflight.add(t)
      try {
        for (let i = 0; i < texts.length && !cancelled; i += BATCH) {
          const chunk = texts.slice(i, i + BATCH)
          const res = await fetch('/api/v1/i18n/translate', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ locale, texts: chunk }),
          })
          if (!res.ok) {
            for (const t of texts.slice(i)) backoff(t)
            break
          }
          const body = (await res.json()) as { translations: (string | null)[] }
          chunk.forEach((t, j) => {
            const tr = body.translations[j]
            if (tr) {
              cache.set(t, tr)
              retryAt.delete(t)
            } else backoff(t)
          })
          if (!cancelled) apply()
        }
        saveStore(locale, cache)
      } catch {
        // Jaringan putus: teks yang belum diterjemahkan tetap tampil dalam
        // bahasa sumber, dan dicoba lagi sesudah jeda.
        for (const t of texts) if (!cache.has(t)) backoff(t)
      } finally {
        for (const t of texts) inflight.delete(t)
        if (!cancelled) {
          setBusy(false)
          setJustDone(true)
          if (doneTimer.current) clearTimeout(doneTimer.current)
          doneTimer.current = setTimeout(() => setJustDone(false), 2500)
        }
      }
    }

    const run = () => {
      timer = null
      if (cancelled) return
      void fetchMissing(apply())
    }

    run()

    // Menu yang dibuka, data yang dimuat, harga yang diperbarui: semua itu
    // menambah atau mengubah teks setelah terjemahan pertama selesai.
    const observer = new MutationObserver(() => {
      if (!timer) timer = setTimeout(run, 200)
    })
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...ATTRS],
    })

    return () => {
      cancelled = true
      observer.disconnect()
      if (timer) clearTimeout(timer)
    }
  }, [locale, pathname])

  if (locale === SOURCE_LOCALE || (!busy && !justDone)) return null

  return (
    <div
      className={`site-translating ${busy ? 'is-busy' : 'is-done'}`}
      role="status"
      translate="no"
    >
      <span className="site-translating-dot" />
      <span>
        {busy
          ? `Menerjemahkan ke ${LOCALE_INFO[locale].native}…`
          : `✓ Halaman dalam ${LOCALE_INFO[locale].native}`}
      </span>
    </div>
  )
}
