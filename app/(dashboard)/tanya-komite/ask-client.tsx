'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { motion } from 'motion/react'
import { IconChat, IconClock, IconPlus, IconTrash, IconClose } from '@/components/icons'
import { InstrumentPicker, type PickerOption } from '@/components/member/instrument-picker'

function useIsMobile() {
  return useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === 'undefined') return () => {}
      const mql = window.matchMedia('(max-width: 959px)')
      mql.addEventListener('change', onStoreChange)
      return () => mql.removeEventListener('change', onStoreChange)
    },
    () => (typeof window !== 'undefined' ? window.innerWidth < 960 : false),
    () => false,
  )
}

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

type Topic = 'saham' | 'kripto' | 'indeks' | 'komoditas' | 'emas' | 'keuangan'

interface ThreadSummary {
  id: number
  userId: number
  title: string
  topic: Topic
  symbol: string | null
  market: string | null
  createdAt: string
  updatedAt: string
}

/** Tautan sumber hanya boleh ke halaman sendiri atau http(s); selainnya tidak ditautkan. */
function safeHref(url: string): string | null {
  if (url.startsWith('/') && !url.startsWith('//')) return url
  return /^https?:\/\//i.test(url) ? url : null
}

function formatThreadDate(isoString: string): string {
  try {
    const d = new Date(isoString)
    const now = new Date()
    const isToday =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear()

    if (isToday) {
      return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
    }

    const yesterday = new Date(now)
    yesterday.setDate(now.getDate() - 1)
    const isYesterday =
      d.getDate() === yesterday.getDate() &&
      d.getMonth() === yesterday.getMonth() &&
      d.getFullYear() === yesterday.getFullYear()

    if (isYesterday) return 'Kemarin'

    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
  } catch {
    return ''
  }
}

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

  // Riwayat percakapan per user
  const isMobile = useIsMobile()
  const [sidebarToggled, setSidebarToggled] = useState<boolean | null>(null)
  const isSidebarOpen = sidebarToggled !== null ? sidebarToggled : !isMobile

  const [threads, setThreads] = useState<ThreadSummary[]>([])
  const [currentThreadId, setCurrentThreadId] = useState<number | null>(null)
  const [loadingThreads, setLoadingThreads] = useState(true)

  const tab = TOPICS.find((t) => t.id === topic) ?? TOPICS[0]
  const selected = options.find((o) => o.id === instrumentId) ?? null
  const tabOptions = useMemo(() => options.filter((o) => tab.classes.includes(o.assetClass)), [options, tab])

  // Muat daftar riwayat thread
  const fetchThreads = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/committee/threads')
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data.threads)) {
          setThreads(data.threads)
        }
      }
    } catch {
      // abaikan bila offline atau gagal
    } finally {
      setLoadingThreads(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    void Promise.resolve().then(() => {
      if (active) void fetchThreads()
    })
    return () => {
      active = false
    }
  }, [fetchThreads])

  // Auto scroll saat pesan bertambah
  useEffect(() => {
    logRef.current?.scrollTo({
      top: logRef.current.scrollHeight,
      behavior: 'smooth',
    })
  }, [messages])

  function closeSidebar() {
    setSidebarToggled(false)
  }

  function toggleSidebar() {
    setSidebarToggled((prev) => !(prev !== null ? prev : !isMobile))
  }

  function pick(id: number | null) {
    setInstrumentId(id)
    setCurrentThreadId(null)
    setMessages([])
  }

  function chooseTopic(id: Topic) {
    if (id === topic) return
    setTopic(id)
    setInstrumentId(null)
    setCurrentThreadId(null)
    setMessages([])
  }

  function startNewChat() {
    setCurrentThreadId(null)
    setMessages([])
    setQuestion('')
    if (isMobile) {
      closeSidebar()
    }
  }

  async function loadThread(threadId: number) {
    if (threadId === currentThreadId || busy) return
    setCurrentThreadId(threadId)
    if (isMobile) {
      closeSidebar()
    }

    try {
      const res = await fetch(`/api/v1/committee/threads/${threadId}`)
      if (!res.ok) return
      const data = await res.json()
      if (data.thread) {
        if (data.thread.topic && TOPICS.some((t) => t.id === data.thread.topic)) {
          setTopic(data.thread.topic as Topic)
        }
        if (data.thread.symbol) {
          const match = options.find((o) => o.symbol.toUpperCase() === data.thread.symbol.toUpperCase())
          setInstrumentId(match?.id ?? null)
        } else {
          setInstrumentId(null)
        }
      }
      if (Array.isArray(data.messages)) {
        setMessages(
          data.messages.map((m: { role: string; content: string; meta?: string | null; sources?: Source[]; error?: boolean }) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
            meta: m.meta ?? undefined,
            sources: Array.isArray(m.sources) ? m.sources : [],
            error: Boolean(m.error),
          }))
        )
      }
    } catch {
      // abaikan kegagalan baca detail
    }
  }

  async function deleteThread(threadId: number) {
    setThreads((prev) => prev.filter((t) => t.id !== threadId))
    if (currentThreadId === threadId) {
      startNewChat()
    }
    try {
      await fetch(`/api/v1/committee/threads/${threadId}`, { method: 'DELETE' })
    } catch {
      fetchThreads()
    }
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
          threadId: currentThreadId ?? undefined,
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

      if (body.threadId && body.threadId !== currentThreadId) {
        setCurrentThreadId(body.threadId)
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

      fetchThreads()
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

  const currentThread = threads.find((t) => t.id === currentThreadId)
  const activeTitle = currentThread
    ? currentThread.title
    : selected
      ? `${selected.symbol} · ${selected.name}`
      : tab.label

  return (
    <section className="panel chat-panel">
      <div className="chat-container">
        {/* Backdrop untuk tampilan mobile/drawer */}
        {isSidebarOpen && (
          <div
            className="chat-sidebar-backdrop"
            onClick={closeSidebar}
            aria-hidden="true"
          />
        )}

        {/* Sidebar riwayat percakapan */}
        <aside className={`chat-sidebar ${isSidebarOpen ? 'open' : 'closed'}`}>
          <div className="chat-sidebar-head">
            <span className="chat-sidebar-title">
              <IconClock size={14} />
              <span>Riwayat Tanya</span>
            </span>
            <button
              type="button"
              className="chat-sidebar-close-btn"
              onClick={closeSidebar}
              aria-label="Tutup riwayat"
            >
              <IconClose size={14} />
            </button>
          </div>

          <div className="chat-sidebar-action">
            <button
              type="button"
              className="btn btn-signal chat-sidebar-new-btn"
              onClick={startNewChat}
            >
              <IconPlus size={14} />
              <span>Percakapan Baru</span>
            </button>
          </div>

          <div className="chat-thread-list">
            {loadingThreads ? (
              <div className="chat-sidebar-empty">Memuat riwayat…</div>
            ) : threads.length === 0 ? (
              <div className="chat-sidebar-empty">
                Belum ada riwayat diskusi. Percakapan Anda akan tersimpan otomatis di sini.
              </div>
            ) : (
              threads.map((th) => (
                <div
                  key={th.id}
                  className={`chat-thread-item ${th.id === currentThreadId ? 'active' : ''}`}
                  onClick={() => loadThread(th.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      loadThread(th.id)
                    }
                  }}
                >
                  <div className="chat-thread-info">
                    <span className="chat-thread-title" title={th.title}>
                      {th.title}
                    </span>
                    <div className="chat-thread-meta">
                      <span className="chat-thread-tag">
                        {th.symbol ? th.symbol : th.topic}
                      </span>
                      <span className="chat-thread-date">
                        {formatThreadDate(th.updatedAt)}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="chat-thread-del"
                    title="Hapus percakapan"
                    aria-label="Hapus percakapan"
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteThread(th.id)
                    }}
                  >
                    <IconTrash size={13} />
                  </button>
                </div>
              ))
            )}
          </div>
        </aside>

        {/* Kompartemen utama chat */}
        <div className="chat-main">
          {/* Header kompartemen chat */}
          <div className="chat-main-head">
            <div className="chat-main-head-left">
              <button
                type="button"
                className={`btn chat-sidebar-toggle-btn ${isSidebarOpen ? 'active' : ''}`}
                onClick={toggleSidebar}
                title={isSidebarOpen ? 'Tutup panel riwayat' : 'Buka panel riwayat'}
              >
                <IconClock size={14} />
                <span>Riwayat</span>
                {threads.length > 0 && <span className="badge-count">{threads.length}</span>}
              </button>
              <span className="chat-main-title">
                <IconChat size={14} />
                <span>{activeTitle}</span>
              </span>
            </div>

            <div className="btn-row">
              {messages.length > 0 && (
                <button
                  type="button"
                  className="btn"
                  style={{ padding: '3px 8px' }}
                  onClick={startNewChat}
                >
                  <IconPlus size={13} />
                  <span>Percakapan Baru</span>
                </button>
              )}
            </div>
          </div>

          {/* Tab topik */}
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

          {/* Instrumen picker opsional */}
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

          {/* Area pesan / saran */}
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

          {/* Form input pesan */}
          <form
            className="panel-body"
            style={{ borderTop: '1px solid var(--line)', marginTop: 'auto' }}
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
        </div>
      </div>
    </section>
  )
}
