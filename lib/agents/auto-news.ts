/**
 * Warta otomatis — redaksi tanpa tombol.
 *
 * Dijalankan oleh job `warta-otomatis` sesuai `job_schedule`. Satu putaran:
 *
 *   1. Kumpulkan judul berita terbaru dari RSS media keuangan.
 *   2. Buang yang sudah pernah jadi bahan warta.
 *   3. Editor AI memilih SATU peristiwa paling penting bagi investor, beserta
 *      1–3 berita yang membahas peristiwa itu, atau menolak bila tidak ada.
 *   4. Isi berita terpilih dibaca lengkap dari halamannya.
 *   5. Agen warta menulis artikel hanya dari bahan itu, lengkap dengan daftar
 *      sumber, foto asli, dan video YouTube yang sudah diperiksa.
 *   6. Berita sumber ditandai terpakai; terjemahan diserahkan ke job lain.
 *
 * Editor boleh menolak. Hari tanpa berita pasar yang berarti lebih baik tanpa
 * warta baru daripada diisi tulisan tentang gunung berapi atau gosip artis.
 */

import { complete } from '@/lib/ai/registry'
import {
  collectRecentHeadlines,
  fetchSourceDocument,
  normaliseLink,
  type Headline,
} from '@/lib/news/sources'
import { filterUnusedLinks, markSourcesUsed } from '@/lib/db/news-source-queries'
import { getMarketNewsList } from '@/lib/db/news-queries'
import { generateLiveNewsArticle, NEWS_CATEGORIES, type NewsCategory } from '@/lib/agents/news-agent'
import type { MarketNewsRow } from '@/lib/db/schema'

/** Judul sebanyak ini sudah mewakili satu siklus berita tanpa membengkakkan prompt. */
const MAX_HEADLINES_FOR_EDITOR = 60

export interface AutoNewsResult {
  published: Array<{ slug: string; title: string; sources: string[] }>
  skipped?: string
  headlinesSeen: number
  /** Hanya pada dry-run: artikel yang akan terbit, tanpa pernah disimpan. */
  draft?: MarketNewsRow
}

interface EditorPick {
  publish: boolean
  reason?: string
  picks?: number[]
  topic?: string
  category?: string
  targetSymbols?: string[]
}

function formatAge(date: Date): string {
  const hours = Math.max(0, Math.round((Date.now() - date.getTime()) / 3600_000))
  return hours === 0 ? '<1 jam' : `${hours} jam`
}

async function askEditor(headlines: Headline[], recentTitles: string[]): Promise<EditorPick> {
  const list = headlines
    .map((h, i) => `${i}. [${h.source}, ${formatAge(h.publishedAt)} lalu] ${h.title}${h.summary ? ` — ${h.summary.slice(0, 160)}` : ''}`)
    .join('\n')

  const prompt = `Anda redaktur pelaksana portal intelijen pasar untuk investor Indonesia (saham IDX, saham AS, emas, komoditas, kripto, makro).

Dari daftar berita terbaru di bawah, pilih SATU peristiwa yang paling berdampak bagi keputusan investor hari ini.

DAFTAR BERITA:
${list}

WARTA YANG SUDAH KAMI TERBITKAN BARU-BARU INI (jangan pilih peristiwa yang sama):
${recentTitles.length > 0 ? recentTitles.map((t) => `- ${t}`).join('\n') : '- (belum ada)'}

Aturan:
- Pilih peristiwa pasar/ekonomi/korporasi yang nyata. Tolak berita bencana, kriminal, politik tanpa dampak pasar, gaya hidup, atau promosi.
- "picks" berisi 1-3 nomor berita yang membahas peristiwa YANG SAMA (sumber berbeda memperkaya fakta). Jangan mencampur peristiwa berbeda.
- "targetSymbols" berisi kode aset yang benar-benar disebut atau jelas terdampak (format: BBCA.JK untuk IDX, NVDA untuk AS, BTCUSDT untuk kripto, GOLD untuk emas). Maksimal 5. Boleh kosong.
- "category" salah satu dari: ${NEWS_CATEGORIES.join(', ')}.
- "topic" adalah sudut pandang artikel dalam satu kalimat Bahasa Indonesia.
- Bila tidak ada satu pun yang layak, balas {"publish": false, "reason": "..."}.

Balas JSON murni:
{"publish": true, "picks": [3, 7], "topic": "...", "category": "saham-idx", "targetSymbols": ["BBRI.JK"], "reason": "..."}`

  const response = await complete({
        feature: 'auto-news',
    messages: [
      { role: 'system', content: 'Anda redaktur berita keuangan. Balas hanya JSON yang valid.' },
      { role: 'user', content: prompt },
    ],
    temperature: 0.2,
    maxOutputTokens: 600,
    json: true,
  })

  const raw = response.text.trim().replace(/^```json\s*/i, '').replace(/\s*```$/i, '')
  try {
    return JSON.parse(raw) as EditorPick
  } catch {
    throw new Error(`Editor AI membalas bukan JSON: ${raw.slice(0, 200)}`)
  }
}

/**
 * Jalankan satu putaran warta otomatis. Menerbitkan paling banyak satu artikel;
 * jadwal yang menentukan berapa kali sehari putaran ini berjalan.
 */
export async function runAutoNewsJob(options: { dryRun?: boolean } = {}): Promise<AutoNewsResult> {
  const all = await collectRecentHeadlines()
  const unused = await filterUnusedLinks(all.map((h) => normaliseLink(h.link)))
  const fresh = all.filter((h) => unused.has(normaliseLink(h.link))).slice(0, MAX_HEADLINES_FOR_EDITOR)

  console.log(`[AutoNews] ${all.length} judul terkumpul, ${fresh.length} belum pernah dipakai`)

  if (fresh.length < 3) {
    return { published: [], skipped: 'berita baru terlalu sedikit', headlinesSeen: all.length }
  }

  const recent = await getMarketNewsList({ limit: 15 })
  const decision = await askEditor(
    fresh,
    recent.map((a) => a.title),
  )

  const picks = [...new Set(decision.picks ?? [])]
    .filter((i) => Number.isInteger(i) && i >= 0 && i < fresh.length)
    .slice(0, 3)
    .map((i) => fresh[i])

  if (!decision.publish || picks.length === 0) {
    console.log(`[AutoNews] Editor menolak: ${decision.reason ?? 'tanpa alasan'}`)
    return {
      published: [],
      skipped: `editor menolak: ${decision.reason ?? 'tidak ada berita layak'}`,
      headlinesSeen: all.length,
    }
  }

  console.log(`[AutoNews] Editor memilih: ${picks.map((p) => p.title).join(' | ')}`)

  const sources = await Promise.all(picks.map(fetchSourceDocument))

  const category = (NEWS_CATEGORIES as readonly string[]).includes(decision.category ?? '')
    ? (decision.category as NewsCategory)
    : 'ekonomi-makro'

  const article = await generateLiveNewsArticle({
    topic: decision.topic || picks[0].title,
    category,
    targetSymbols: (decision.targetSymbols ?? []).slice(0, 5),
    sources,
    translate: false,
    dryRun: options.dryRun,
  })

  if (options.dryRun) {
    return {
      published: [],
      skipped: 'dry-run: tidak ada yang disimpan',
      headlinesSeen: all.length,
      draft: article,
    }
  }

  // Ditandai setelah artikel tersimpan. Bila penulisan gagal, berita yang sama
  // masih bisa dipilih ulang pada putaran berikutnya.
  await markSourcesUsed(
    picks.map((p) => ({ link: normaliseLink(p.link), title: p.title, source: p.source })),
    article.slug,
  )

  return {
    published: [{ slug: article.slug, title: article.title, sources: picks.map((p) => p.link) }],
    headlinesSeen: all.length,
  }
}
