'use client'

/**
 * Kalkulator investasi publik.
 *
 * Seluruh hitungan berjalan di peramban (lib/calculator/finance.ts), jadi
 * memakai kalkulator tidak menyentuh server maupun kuota model. Model hanya
 * dipanggil saat pengunjung menekan "Tanya AI", dan panggilan itu dijaga
 * Turnstile, kuota per pengunjung, dan pagu harian di server.
 */

import Link from 'next/link'
import { useMemo, useRef, useState } from 'react'
import { TurnstileWidget, TURNSTILE_SITE_KEY, type TurnstileHandle } from '@/components/turnstile-widget'
import {
  IconTrendUp,
  IconTarget,
  IconShield,
  IconCompass,
  IconSparkles,
  IconArrowRight,
  IconCheck,
} from '@/components/icons'
import {
  ALLOCATIONS,
  EMERGENCY_MONTHS,
  HOUSEHOLD_LABEL,
  PROFILE_RETURN,
  RISK_QUESTIONS,
  planEmergency,
  planTarget,
  riskProfile,
  simulateDca,
  type HouseholdStatus,
} from '@/lib/calculator/finance'

type Calc = 'dca' | 'target' | 'darurat' | 'alokasi'

const TABS = [
  { id: 'dca' as const, label: 'Investasi Rutin', icon: IconTrendUp, lead: 'Berapa nilai investasimu kalau menyisihkan uang tiap bulan?' },
  { id: 'target' as const, label: 'Target Dana', icon: IconTarget, lead: 'Berapa yang perlu disisihkan per bulan untuk mencapai tujuanmu?' },
  { id: 'darurat' as const, label: 'Dana Darurat', icon: IconShield, lead: 'Berapa dana darurat yang ideal untuk kondisimu?' },
  { id: 'alokasi' as const, label: 'Profil Risiko', icon: IconCompass, lead: 'Cocoknya investasi di mana? Kenali profil risikomu.' },
]


const ALLOC_COLOR = ['#fa862a', '#38bdf8', '#34d399', '#fbbf24', '#f43f5e']

function rupiah(n: number): string {
  if (!Number.isFinite(n)) return '—'
  return `Rp${Math.round(n).toLocaleString('id-ID')}`
}

/** Angka ringkas untuk sumbu grafik: 1,2 jt / 3,4 M. */
function short(n: number): string {
  if (n >= 1e12) return `${(n / 1e12).toLocaleString('id-ID', { maximumFractionDigits: 1 })} T`
  if (n >= 1e9) return `${(n / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 1 })} M`
  if (n >= 1e6) return `${(n / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 })} jt`
  return Math.round(n).toLocaleString('id-ID')
}

/** Kolom angka rupiah: menerima "1.500.000" maupun "1500000". */
function MoneyField({ label, value, onChange, hint }: { label: string; value: number; onChange: (v: number) => void; hint?: string }) {
  return (
    <label className="calc-field">
      <span className="calc-label">{label}</span>
      <div className="calc-money">
        <span>Rp</span>
        <input
          inputMode="numeric"
          value={value ? value.toLocaleString('id-ID') : ''}
          placeholder="0"
          onChange={(e) => {
            const n = Number(e.target.value.replace(/[^\d]/g, ''))
            onChange(Number.isFinite(n) ? Math.min(n, 1e15) : 0)
          }}
        />
      </div>
      {hint && <span className="calc-hint">{hint}</span>}
    </label>
  )
}

function NumberField({
  label,
  value,
  onChange,
  suffix,
  min = 0,
  max = 100,
  step = 1,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  suffix: string
  min?: number
  max?: number
  step?: number
}) {
  return (
    <label className="calc-field">
      <span className="calc-label">
        {label} <strong>{value.toLocaleString('id-ID')} {suffix}</strong>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  )
}

export function KalkulatorClient({ signedIn }: { signedIn: boolean }) {
  const [calc, setCalc] = useState<Calc>('dca')

  // Investasi rutin
  const [dca, setDca] = useState({ initial: 5_000_000, monthly: 1_000_000, annualReturn: 8, years: 10, inflation: 3, stepUp: 5 })
  const dcaResult = useMemo(() => simulateDca(dca), [dca])

  // Target dana
  const [tgt, setTgt] = useState({ target: 500_000_000, years: 10, current: 10_000_000, annualReturn: 8, inflation: 3 })
  const tgtResult = useMemo(() => planTarget(tgt), [tgt])

  // Dana darurat
  const [em, setEm] = useState({ expense: 6_000_000, status: 'lajang' as HouseholdStatus, saved: 5_000_000, monthlySave: 1_000_000 })
  const emResult = useMemo(() => planEmergency(em.expense, em.status, em.saved, em.monthlySave), [em])

  // Profil risiko
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const answered = RISK_QUESTIONS.every((q) => answers[q.id])
  const profile = answered ? riskProfile(RISK_QUESTIONS.map((q) => answers[q.id])) : null

  // Konteks untuk AI: hanya label dan angka dari kalkulator yang sedang dibuka.
  // Dihitung ulang tiap render; React Compiler yang mengurus memoisasinya.
  const context = (() => {
    if (calc === 'dca')
      return {
        calculator: 'dca' as const,
        inputs: { setoranAwal: dca.initial, setoranBulanan: dca.monthly, imbalHasilPersenTahun: dca.annualReturn, tahun: dca.years, inflasiPersen: dca.inflation, kenaikanSetoranPersenTahun: dca.stepUp },
        results: { totalSetoran: Math.round(dcaResult.contributed), nilaiAkhir: Math.round(dcaResult.finalValue), keuntungan: Math.round(dcaResult.gain), nilaiRiilHariIni: Math.round(dcaResult.realValue) },
      }
    if (calc === 'target')
      return {
        calculator: 'target' as const,
        inputs: { targetHariIni: tgt.target, tahun: tgt.years, tabunganSekarang: tgt.current, imbalHasilPersenTahun: tgt.annualReturn, inflasiPersen: tgt.inflation },
        results: { targetSetelahInflasi: Math.round(tgtResult.futureTarget), setoranBulananDibutuhkan: Math.round(tgtResult.monthlyNeeded), tabunganSekarangMenjadi: Math.round(tgtResult.currentGrows) },
      }
    if (calc === 'darurat')
      return {
        calculator: 'darurat' as const,
        inputs: { pengeluaranBulanan: em.expense, status: HOUSEHOLD_LABEL[em.status], sudahTerkumpul: em.saved, sisihkanPerBulan: em.monthlySave },
        results: { targetMin: emResult.min, targetMaks: emResult.max, kekurangan: emResult.gap, bulanSampaiMin: emResult.monthsToMin ?? 'tidak tercapai tanpa setoran' },
      }
    return {
      calculator: 'alokasi' as const,
      inputs: Object.fromEntries(RISK_QUESTIONS.map((q) => [q.id, q.options.find(([, v]) => v === answers[q.id])?.[0] ?? 'belum dijawab'])),
      results: profile
        ? Object.fromEntries([['profil', profile], ...ALLOCATIONS[profile].map((a) => [a.label, `${a.pct}%`])])
        : { profil: 'belum lengkap' },
    }
  })()

  const maxBar = Math.max(1, ...dcaResult.schedule.map((y) => y.value))

  return (
    <div className="calc-wrap">
      <div className="calc-tabs-bar" role="tablist" aria-label="Pilih kalkulator">
        {TABS.map((t) => {
          const Icon = t.icon
          const isSelected = t.id === calc
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              className={`calc-tab ${isSelected ? 'is-active' : ''}`}
              aria-selected={isSelected}
              onClick={() => setCalc(t.id)}
            >
              <span className="calc-tab-icon" aria-hidden="true">
                <Icon size={15} />
              </span>
              <span>{t.label}</span>
            </button>
          )
        })}
      </div>

      <section className="calc-card">
        <header className="calc-card-head">
          <p className="calc-lead">{TABS.find((t) => t.id === calc)?.lead}</p>
        </header>

        {calc === 'dca' && (
          <div className="calc-grid">
            <div className="calc-inputs">
              <MoneyField label="Setoran awal" value={dca.initial} onChange={(v) => setDca({ ...dca, initial: v })} />
              <MoneyField label="Setoran per bulan" value={dca.monthly} onChange={(v) => setDca({ ...dca, monthly: v })} />
              <NumberField label="Perkiraan imbal hasil" suffix="% / tahun" value={dca.annualReturn} max={25} step={0.5} onChange={(v) => setDca({ ...dca, annualReturn: v })} />
              <NumberField label="Jangka waktu" suffix="tahun" value={dca.years} min={1} max={40} onChange={(v) => setDca({ ...dca, years: v })} />
              <NumberField label="Kenaikan setoran" suffix="% / tahun" value={dca.stepUp} max={20} onChange={(v) => setDca({ ...dca, stepUp: v })} />
              <NumberField label="Inflasi" suffix="% / tahun" value={dca.inflation} max={10} step={0.5} onChange={(v) => setDca({ ...dca, inflation: v })} />
            </div>
            <div className="calc-results">
              <div className="calc-big">
                <span>Nilai akhir</span>
                <strong>{rupiah(dcaResult.finalValue)}</strong>
              </div>
              <div className="calc-kv"><span>Total yang kamu setor</span><b>{rupiah(dcaResult.contributed)}</b></div>
              <div className="calc-kv"><span>Hasil investasi</span><b className="pos">{rupiah(dcaResult.gain)}</b></div>
              <div className="calc-kv"><span>Setara daya beli hari ini</span><b>{rupiah(dcaResult.realValue)}</b></div>
              <div className="calc-bars" aria-label="Pertumbuhan per tahun">
                {dcaResult.schedule.map((y) => (
                  <div key={y.year} className="calc-bar" title={`Tahun ${y.year}: ${rupiah(y.value)}`}>
                    <span className="calc-bar-value" style={{ height: `${(y.value / maxBar) * 100}%` }}>
                      <span className="calc-bar-paid" style={{ height: `${(y.contributed / y.value) * 100}%` }} />
                    </span>
                  </div>
                ))}
              </div>
              <div className="calc-legend">
                <span><i className="paid" />Setoran</span>
                <span><i className="grow" />Hasil</span>
                <span>puncak {short(maxBar)}</span>
              </div>
            </div>
          </div>
        )}

        {calc === 'target' && (
          <div className="calc-grid">
            <div className="calc-inputs">
              <MoneyField label="Target (nilai uang hari ini)" value={tgt.target} onChange={(v) => setTgt({ ...tgt, target: v })} hint="mis. DP rumah, dana pendidikan, pensiun" />
              <NumberField label="Dalam waktu" suffix="tahun" value={tgt.years} min={1} max={40} onChange={(v) => setTgt({ ...tgt, years: v })} />
              <MoneyField label="Tabungan / investasi sekarang" value={tgt.current} onChange={(v) => setTgt({ ...tgt, current: v })} />
              <NumberField label="Perkiraan imbal hasil" suffix="% / tahun" value={tgt.annualReturn} max={25} step={0.5} onChange={(v) => setTgt({ ...tgt, annualReturn: v })} />
              <NumberField label="Inflasi" suffix="% / tahun" value={tgt.inflation} max={10} step={0.5} onChange={(v) => setTgt({ ...tgt, inflation: v })} />
            </div>
            <div className="calc-results">
              <div className="calc-big">
                <span>Sisihkan per bulan</span>
                <strong>{tgtResult.monthlyNeeded === 0 ? 'Sudah cukup' : rupiah(tgtResult.monthlyNeeded)}</strong>
              </div>
              <div className="calc-kv"><span>Target setelah inflasi</span><b>{rupiah(tgtResult.futureTarget)}</b></div>
              <div className="calc-kv"><span>Tabunganmu sekarang akan menjadi</span><b>{rupiah(tgtResult.currentGrows)}</b></div>
              <div className="calc-kv"><span>Total setoran selama {tgt.years} tahun</span><b>{rupiah(tgtResult.totalContribution)}</b></div>
              <p className="calc-note">
                Inflasi membuat target {rupiah(tgt.target)} hari ini setara {rupiah(tgtResult.futureTarget)} dalam {tgt.years} tahun —
                itu angka yang sebenarnya perlu dikumpulkan.
              </p>
            </div>
          </div>
        )}

        {calc === 'darurat' && (
          <div className="calc-grid">
            <div className="calc-inputs">
              <MoneyField label="Pengeluaran wajib per bulan" value={em.expense} onChange={(v) => setEm({ ...em, expense: v })} hint="makan, sewa/cicilan, transportasi, tagihan" />
              <label className="calc-field">
                <span className="calc-label">Kondisimu</span>
                <select className="calc-select" value={em.status} onChange={(e) => setEm({ ...em, status: e.target.value as HouseholdStatus })}>
                  {(Object.keys(HOUSEHOLD_LABEL) as HouseholdStatus[]).map((s) => (
                    <option key={s} value={s}>
                      {HOUSEHOLD_LABEL[s]} ({EMERGENCY_MONTHS[s][0] === EMERGENCY_MONTHS[s][1] ? EMERGENCY_MONTHS[s][0] : EMERGENCY_MONTHS[s].join('–')} bulan)
                    </option>
                  ))}
                </select>
              </label>
              <MoneyField label="Sudah terkumpul" value={em.saved} onChange={(v) => setEm({ ...em, saved: v })} />
              <MoneyField label="Bisa disisihkan per bulan" value={em.monthlySave} onChange={(v) => setEm({ ...em, monthlySave: v })} />
            </div>
            <div className="calc-results">
              <div className="calc-big">
                <span>Dana darurat ideal</span>
                <strong>{emResult.min === emResult.max ? rupiah(emResult.min) : `${rupiah(emResult.min)} – ${rupiah(emResult.max)}`}</strong>
              </div>
              <div className="calc-kv"><span>Kekurangan dari batas bawah</span><b className={emResult.gap > 0 ? 'neg' : 'pos'}>{emResult.gap > 0 ? rupiah(emResult.gap) : 'Sudah tercapai'}</b></div>
              <div className="calc-kv">
                <span>Waktu untuk mencapainya</span>
                <b>{emResult.monthsToMin === null ? 'Tentukan setoran bulanan' : emResult.monthsToMin === 0 ? '—' : `${emResult.monthsToMin} bulan`}</b>
              </div>
              <div className="calc-progress" aria-label="Kemajuan dana darurat">
                <span style={{ width: `${Math.min(100, (em.saved / Math.max(1, emResult.min)) * 100)}%` }} />
              </div>
              <p className="calc-note">Simpan di tempat yang mudah dicairkan dan tidak naik-turun: tabungan terpisah, deposito, atau reksa dana pasar uang.</p>
            </div>
          </div>
        )}

        {calc === 'alokasi' && (
          <div className="calc-grid">
            <div className="calc-inputs">
              {RISK_QUESTIONS.map((q, i) => (
                <fieldset key={q.id} className="calc-question">
                  <legend>{i + 1}. {q.question}</legend>
                  {q.options.map(([label, value]) => {
                    const isSelected = answers[q.id] === value
                    return (
                      <label key={label} className={`calc-choice ${isSelected ? 'on' : ''}`}>
                        <input
                          type="radio"
                          name={q.id}
                          checked={isSelected}
                          onChange={() => setAnswers({ ...answers, [q.id]: value })}
                        />
                        <span className="calc-choice-indicator" aria-hidden="true">
                          {isSelected && <IconCheck size={11} />}
                        </span>
                        <span className="calc-choice-text">{label}</span>
                      </label>
                    )
                  })}
                </fieldset>
              ))}
            </div>
            <div className="calc-results">
              {profile ? (
                <>
                  <div className="calc-big">
                    <span>Profil risikomu</span>
                    <strong style={{ textTransform: 'capitalize' }}>{profile}</strong>
                  </div>
                  <div className="calc-stack">
                    {ALLOCATIONS[profile].map((a, i) => (
                      <span key={a.label} style={{ width: `${a.pct}%`, background: ALLOC_COLOR[i] }} title={`${a.label} ${a.pct}%`} />
                    ))}
                  </div>
                  {ALLOCATIONS[profile].map((a, i) => (
                    <div key={a.label} className="calc-kv">
                      <span><i className="calc-dot" style={{ background: ALLOC_COLOR[i] }} />{a.label}<small>{a.note}</small></span>
                      <b>{a.pct}%</b>
                    </div>
                  ))}
                  <p className="calc-note">
                    Perkiraan imbal hasil jangka panjang profil ini sekitar {PROFILE_RETURN[profile]}% per tahun.{' '}
                    <button type="button" className="calc-link" onClick={() => { setDca({ ...dca, annualReturn: PROFILE_RETURN[profile] }); setCalc('dca') }}>
                      Hitung dengan Investasi Rutin <IconArrowRight size={13} style={{ display: 'inline-block', verticalAlign: '-1px', marginLeft: 4 }} />
                    </button>
                  </p>
                </>
              ) : (
                <p className="calc-note">Jawab kelima pertanyaan untuk melihat profil dan saran alokasinya.</p>
              )}
            </div>
          </div>
        )}

        <p className="calc-disclaimer">
          Hitungan ini simulasi dengan asumsi tetap; imbal hasil nyata naik-turun dan tidak dijamin. Gambaran umum, bukan nasihat investasi berlisensi.
        </p>
      </section>

      <AskPanel context={context} signedIn={signedIn} />
    </div>
  )
}

function AskPanel({ context, signedIn }: { context: unknown; signedIn: boolean }) {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [needsAccount, setNeedsAccount] = useState(false)
  const [busy, setBusy] = useState(false)
  const [token, setToken] = useState<string | null>(null)
  const turnstile = useRef<TurnstileHandle>(null)

  // Pengunjung tanpa akun wajib lolos Turnstile untuk tiap pertanyaan.
  const needsChallenge = !signedIn && Boolean(TURNSTILE_SITE_KEY)
  const ready = question.trim().length >= 3 && !busy && (!needsChallenge || Boolean(token))

  async function ask() {
    if (!ready) return
    setBusy(true)
    setError(null)
    setNeedsAccount(false)
    try {
      const res = await fetch('/api/v1/kalkulator/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: question.trim(), context, turnstileToken: token ?? undefined }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        setError(body?.error ?? (res.status === 429 ? 'Batas pertanyaan tercapai. Coba lagi nanti.' : 'AI sedang tidak bisa menjawab.'))
        setNeedsAccount(Boolean(body?.needsAccount))
        return
      }
      setAnswer(body.answer)
    } catch {
      setError('Koneksi terputus. Coba lagi.')
    } finally {
      setBusy(false)
      // Token Turnstile sekali pakai: minta yang baru untuk pertanyaan berikutnya.
      turnstile.current?.reset()
      setToken(null)
    }
  }

  return (
    <section className="calc-card calc-ask">
      <h2 className="calc-ask-title">
        <span className="calc-ask-icon" aria-hidden="true">
          <IconSparkles size={17} />
        </span>
        Tanya AI Soal Hasil Hitunganmu
      </h2>
      <p className="calc-note" style={{ marginTop: 0 }}>
        AI membaca angka di kalkulator yang sedang kamu buka. {signedIn ? '' : 'Pengunjung tanpa akun punya jatah terbatas per hari.'}
      </p>
      <textarea
        className="calc-textarea"
        rows={3}
        maxLength={300}
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="mis. Apakah target ini realistis? Instrumen apa yang cocok untuk tujuan ini?"
      />
      <div className="calc-ask-row">
        {needsChallenge && <TurnstileWidget ref={turnstile} action="kalkulator-ai" onToken={setToken} />}
        <span className="calc-hint">{question.length}/300</span>
        <button type="button" className="calc-send" onClick={ask} disabled={!ready}>
          <IconSparkles size={14} style={{ marginRight: 6 }} />
          <span>{busy ? 'Menyusun jawaban…' : 'Tanya AI'}</span>
        </button>
      </div>
      {error && (
        <p className="calc-error">
          {error}{' '}
          {needsAccount && (
            <Link href="/daftar" className="calc-error-link">
              Daftar gratis <IconArrowRight size={13} style={{ display: 'inline-block', verticalAlign: '-1px', marginLeft: 4 }} />
            </Link>
          )}
        </p>
      )}
      {answer && <div className="calc-answer">{answer}</div>}
    </section>
  )
}

