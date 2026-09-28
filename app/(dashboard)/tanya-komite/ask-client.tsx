'use client'

import { useEffect, useRef, useState } from 'react'
import { IconChat } from '@/components/icons'
import { Blank } from '@/components/ui'
import { InstrumentPicker, type PickerOption } from '@/components/member/instrument-picker'

interface Option extends PickerOption {
  market: string
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  meta?: string
  error?: boolean
}

const SUGGESTIONS = [
  'Bagaimana tren harganya dalam setahun terakhir?',
  'Apa risiko terbesar yang terlihat dari datanya?',
  'Kenapa komite sampai pada putusan terakhirnya?',
  'Seberapa jauh harganya dari puncak tertingginya?',
]

/** Giliran sebelumnya yang ikut dikirim, supaya pertanyaan lanjutan tetap nyambung. */
const HISTORY_TURNS = 6

export function AskClient({ options, initialId }: { options: Option[]; initialId: number | null }) {
  const [instrumentId, setInstrumentId] = useState<number | null>(initialId)
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [busy, setBusy] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)

  const selected = options.find((o) => o.id === instrumentId) ?? null

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  function pick(id: number) {
    setInstrumentId(id)
    // Percakapan terikat pada satu instrumen; berganti instrumen berarti mulai baru.
    setMessages([])
  }

  async function ask(text: string) {
    const q = text.trim()
    if (!selected || q.length < 3 || busy) return
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
        body: JSON.stringify({ market: selected.market, symbol: selected.symbol, question: q, history }),
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
      setMessages((m) => [...m, { role: 'assistant', content: body.answer, meta: body.model ? `dijawab ${body.model}` : undefined }])
    } catch {
      setMessages((m) => [...m, { role: 'assistant', content: 'Koneksi terputus. Coba lagi.', error: true }])
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <span className="panel-title">
          <IconChat size={14} />
          {selected ? `${selected.symbol} · ${selected.name}` : 'Pilih instrumen'}
        </span>
      </div>
      <div className="panel-body" style={{ borderBottom: '1px solid var(--line)' }}>
        <div className="field" style={{ maxWidth: 420 }}>
          <span className="field-label">Instrumen</span>
          <InstrumentPicker options={options} value={instrumentId} onChange={pick} />
        </div>
      </div>

      {messages.length === 0 ? (
        selected ? (
          <div className="panel-body">
            <p className="kpi-note" style={{ marginBottom: 10 }}>
              Contoh pertanyaan:
            </p>
            <div className="chip-row">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" className="chip" onClick={() => ask(s)} disabled={busy}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <Blank icon={<IconChat size={22} />} title="Pilih instrumen dulu">
            Asisten menjawab satu instrumen per percakapan.
          </Blank>
        )
      ) : (
        <div className="chat-log" ref={logRef} aria-live="polite">
          {messages.map((m, i) => (
            <div key={i} className={`chat-msg ${m.role}`} style={m.error ? { borderColor: 'var(--halted)' } : undefined}>
              {m.content}
              {m.meta && <div className="chat-meta">{m.meta}</div>}
            </div>
          ))}
          {busy && <div className="chat-msg assistant">Menyusun jawaban dari data…</div>}
        </div>
      )}

      {selected && (
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
                maxLength={500}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    ask(question)
                  }
                }}
                placeholder={`Tanya soal ${selected.symbol}…`}
              />
            </label>
            <button type="submit" className="btn btn-signal" disabled={busy || question.trim().length < 3}>
              Kirim
            </button>
          </div>
        </form>
      )}
    </section>
  )
}
