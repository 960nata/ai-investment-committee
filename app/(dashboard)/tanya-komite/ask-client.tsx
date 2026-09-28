'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { IconChat } from '@/components/icons'
import { InstrumentPicker, type PickerOption } from '@/components/member/instrument-picker'

interface Option extends PickerOption {
  market: string
}

interface Source {
  n: number
  title: string
  source: string
  url: string
  publishedAt: string
  internal: boolean
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  meta?: string
  error?: boolean
  sources?: Source[]
}

/** Tautan sumber hanya boleh ke halaman sendiri atau http(s); selainnya tidak ditautkan. */
function safeHref(url: string): string | null {
  if (url.startsWith('/') && !url.startsWith('//')) return url
  return /^https?:\/\//i.test(url) ? url : null
}

type Topic = 'saham' | 'kripto' | 'indeks' | 'komoditas' | 'emas' | 'keuangan'

/** Tab topik. `classes` menyaring pemilih instrumen; nasihat keuangan tidak memakai instrumen. */
const TOPICS: {
  id: Topic
  label: string
  classes: string[]
  placeholder: string
  suggestions: string[]
}[] = [
  {
    id: 'saham',
    label: 'Saham',
    classes: ['saham'],
    placeholder: 'Tanya soal saham, mis. saham bank mana yang turun paling dalam?',
    suggestions: [
      'Saham apa yang naik dan turun paling besar hari ini?',
      'Bagaimana cara menilai saham bank sebelum membeli?',
      'Saya pemula dengan modal Rp5 juta, mulai dari mana?',
      'Apa bedanya investasi saham untuk dividen dan untuk pertumbuhan?',
    ],
  },
  {
    id: 'kripto',
    label: 'Kripto',
    classes: ['crypto', 'memecoin'],
    placeholder: 'Tanya soal kripto, mis. seberapa besar porsi kripto yang wajar?',
    suggestions: [
      'Kripto apa yang bergerak paling besar hari ini?',
      'Berapa porsi kripto yang wajar di portofolio saya?',
      'Apa risiko meme coin dibanding bitcoin?',
      'Apakah DCA bitcoin masuk akal untuk jangka panjang?',
    ],
  },
  {
    id: 'indeks',
    label: 'Indeks',
    classes: ['indeks'],
    placeholder: 'Tanya soal indeks, mis. kenapa IHSG melemah?',
    suggestions: [
      'Bagaimana kondisi IHSG dan indeks dunia sekarang?',
      'Apa hubungan Wall Street dengan IHSG?',
      'Apakah reksa dana indeks cocok untuk pemula?',
      'Indeks mana yang paling bergejolak belakangan ini?',
    ],
  },
  {
    id: 'komoditas',
    label: 'Komoditas',
    classes: ['komoditi'],
    placeholder: 'Tanya soal komoditas, mis. dampak perang ke harga minyak?',
    suggestions: [
      'Kalau konflik Timur Tengah memanas, apa dampaknya ke harga minyak?',
      'Komoditas apa yang naik paling besar hari ini?',
      'Bagaimana harga batu bara memengaruhi saham tambang IDX?',
      'Apa yang menggerakkan harga CPO dan nikel?',
    ],
  },
  {
    id: 'emas',
    label: 'Emas',
    classes: ['emas'],
    placeholder: 'Tanya soal emas, mis. emas fisik atau emas digital?',
    suggestions: [
      'Bagaimana harga emas sekarang dan apa penggeraknya?',
      'Emas fisik, digital, atau reksa dana emas — mana yang cocok?',
      'Berapa porsi emas yang wajar untuk lindung nilai?',
      'Kenapa emas biasanya naik saat suku bunga turun?',
    ],
  },
  {
    id: 'keuangan',
    label: 'Nasihat Keuangan',
    classes: [],
    placeholder: 'Ceritakan kondisi keuanganmu, mis. gaji, cicilan, tujuan…',
    suggestions: [
      'Gaji saya Rp8 juta, bagaimana membagi anggaran bulanan?',
      'Berapa dana darurat yang ideal dan disimpan di mana?',
      'Saya punya cicilan kartu kredit, lunasi dulu atau mulai investasi?',
      'Umur 25, mau siapkan pensiun — mulai dari mana?',
    ],
  },
]

/** Giliran sebelumnya yang ikut dikirim, supaya pertanyaan lanjutan tetap nyambung. */
const HISTORY_TURNS = 8

export function AskClient({ options, initialId }: { options: Option[]; initialId: number | null }) {
  const initialTopic: Topic = (() => {
    const cls = options.find((o) => o.id === initialId)?.assetClass
    return TOPICS.find((t) => cls && t.classes.includes(cls))?.id ?? 'saham'
  })()
  const [topic, setTopic] = useState<Topic>(initialTopic)
  const [instrumentId, setInstrumentId] = useState<number | null>(initialId)
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [busy, setBusy] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)

  const tab = TOPICS.find((t) => t.id === topic) ?? TOPICS[0]
  const selected = options.find((o) => o.id === instrumentId) ?? null
  const tabOptions = useMemo(() => options.filter((o) => tab.classes.includes(o.assetClass)), [options, tab])

  useEffect(() => {
    logRef.current?.scrollTo({
      top: logRef.current.scrollHeight,
      behavior: 'smooth',
    })
  }, [messages])

  function pick(id: number | null) {
    setInstrumentId(id)
    // Berganti instrumen berarti percakapan baru: konteks datanya ikut berganti.
    setMessages([])
  }

  function chooseTopic(id: Topic) {
    if (id === topic) return
    setTopic(id)
    setInstrumentId(null)
    setMessages([])
  }

  async function ask(text: string) {
    const q = text.trim()
    if (q.length < 3 || busy) return
    const history = messages
      .filter((m) => !m.error)
      .slice(-HISTORY_TURNS)
      .map(({ role, content }) => ({ role, content }))
    setMessages((m) => [...m, { role: 'user', content: q }])
    setQuestion('')
    setBusy(true)
    try {
      const res = await fetch('/api/v1/committee/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          topic,
          ...(selected ? { market: selected.market, symbol: selected.symbol } : {}),
          question: q,
          history,
        }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        const message =
          res.status === 429
            ? (body?.error ?? 'Batas pertanyaan tercapai. Coba lagi nanti.')
            : (body?.error ?? 'Asisten sedang tidak bisa menjawab.')
        setMessages((m) => [...m, { role: 'assistant', content: message, error: true }])
        return
      }
      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          content: body.answer,
          meta: body.model ? `dijawab ${body.model}` : undefined,
          sources: Array.isArray(body.sources) ? body.sources : [],
        },
      ])
    } catch {
      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          content: 'Koneksi terputus. Coba lagi.',
          error: true,
        },
      ])
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel">
      <div
        className="tabs"
        role="tablist"
        aria-label="Topik pertanyaan"
        style={{ borderBottom: '1px solid var(--line)' }}
      >
        {TOPICS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            className="tab"
            aria-selected={t.id === topic}
            onClick={() => chooseTopic(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="panel-head">
        <span className="panel-title">
          <IconChat size={14} />
          {selected ? `${selected.symbol} · ${selected.name}` : tab.label}
        </span>
        {messages.length > 0 && (
          <button
            type="button"
            className="btn"
            style={{ marginLeft: 'auto', padding: '3px 8px' }}
            onClick={() => setMessages([])}
          >
            Percakapan baru
          </button>
        )}
      </div>
      {tab.classes.length > 0 && (
        <div className="panel-body" style={{ borderBottom: '1px solid var(--line)' }}>
          <div className="form-row">
            <div className="field" style={{ flex: '1 1 280px', maxWidth: 420 }}>
              <span className="field-label">Instrumen (opsional)</span>
              <InstrumentPicker
                options={tabOptions}
                value={instrumentId}
                onChange={pick}
                placeholder={`Semua ${tab.label.toLowerCase()} — atau cari satu…`}
              />
            </div>
            {selected && (
              <button type="button" className="btn" onClick={() => pick(null)}>
                Semua {tab.label.toLowerCase()}
              </button>
            )}
          </div>
        </div>
      )}

      {messages.length === 0 ? (
        <div className="panel-body">
          <p className="kpi-note" style={{ marginBottom: 10 }}>
            {selected
              ? `Tanya apa saja soal ${selected.symbol}, atau mulai dari contoh ini:`
              : tab.id === 'keuangan'
                ? 'Ceritakan kondisimu dan tujuanmu — makin jelas, makin tepat sarannya. Contoh:'
                : 'Contoh pertanyaan:'}
          </p>
          <div className="chip-row">
            {tab.suggestions.map((sg) => (
              <button key={sg} type="button" className="chip" onClick={() => ask(sg)} disabled={busy}>
                {sg}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="chat-log" ref={logRef} aria-live="polite">
          {messages.map((m, i) => (
            <motion.div
              key={i}
              className={`chat-msg ${m.role}`}
              style={m.error ? { borderColor: 'var(--halted)' } : undefined}
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            >
              {m.content}
              {m.sources && m.sources.length > 0 && (
                <div className="chat-sources">
                  <div className="chat-sources-label">Sumber berita</div>
                  <ol>
                    {m.sources.map((s) => {
                      const href = safeHref(s.url)
                      const date = new Date(s.publishedAt).toLocaleDateString('id-ID', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })
                      return (
                        <li key={s.n} value={s.n}>
                          {href ? (
                            <a
                              href={href}
                              {...(s.internal
                                ? {}
                                : {
                                    target: '_blank',
                                    rel: 'noopener noreferrer',
                                  })}
                            >
                              {s.title}
                            </a>
                          ) : (
                            s.title
                          )}
                          <span className="chat-source-meta">
                            {' '}
                            · {s.source} · {date}
                          </span>
                        </li>
                      )
                    })}
                  </ol>
                </div>
              )}
              {m.meta && <div className="chat-meta">{m.meta}</div>}
            </motion.div>
          ))}
          {busy && (
            <motion.div
              className="chat-msg assistant chat-typing"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0.45, 1, 0.45] }}
              transition={{
                duration: 1.4,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            >
              Menyusun jawaban dari data…
            </motion.div>
          )}
        </div>
      )}

      <form
        className="panel-body"
        style={{ borderTop: '1px solid var(--line)' }}
        onSubmit={(e) => {
          e.preventDefault()
          ask(question)
        }}
      >
        <div className="form-row">
          <label className="field" style={{ flex: '1 1 320px' }}>
            <span className="field-label">Pertanyaan</span>
            <textarea
              className="textarea"
              rows={2}
              maxLength={800}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  ask(question)
                }
              }}
              placeholder={selected ? `Tanya soal ${selected.symbol}…` : tab.placeholder}
            />
          </label>
          <button type="submit" className="btn btn-signal" disabled={busy || question.trim().length < 3}>
            Kirim
          </button>
        </div>
      </form>
    </section>
  )
}
