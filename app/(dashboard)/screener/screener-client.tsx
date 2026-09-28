'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { IconFilter } from '@/components/icons'
import { Blank } from '@/components/ui'
import { ChangeText, ScoreText, VerdictTag } from '@/components/member/cells'
import { WatchToggle } from '@/components/member/watch-toggle'
import { formatPriceIn } from '@/lib/format/market'
import { ASSET_CLASS_LABEL } from '@/lib/member/labels'
import type { Horizon, MarketRow } from '@/lib/member/market-view'

type SortKey = 'score' | 'change' | 'symbol' | 'confidence'

export function ScreenerClient({ rows, watchlistIds }: { rows: MarketRow[]; watchlistIds: number[] }) {
  const [query, setQuery] = useState('')
  const [assetClass, setAssetClass] = useState('semua')
  const [horizon, setHorizon] = useState<Horizon>('menengah')
  const [minScore, setMinScore] = useState(-10)
  const [verdict, setVerdict] = useState('semua')
  const [move, setMove] = useState<'semua' | 'naik' | 'turun'>('semua')
  const [scoredOnly, setScoredOnly] = useState(false)
  const [sort, setSort] = useState<SortKey>('score')
  const [desc, setDesc] = useState(true)

  const classes = useMemo(() => [...new Set(rows.map((r) => r.assetClass))], [rows])
  const watch = useMemo(() => new Set(watchlistIds), [watchlistIds])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const out = rows.filter((r) => {
      if (q && !r.symbol.toLowerCase().includes(q) && !r.name.toLowerCase().includes(q) && !(r.sector ?? '').toLowerCase().includes(q)) return false
      if (assetClass !== 'semua' && r.assetClass !== assetClass) return false
      const s = r.scores[horizon]
      if (scoredOnly && !s) return false
      if (s && s.score < minScore) return false
      if (!s && minScore > -10) return false
      if (verdict !== 'semua') {
        if (verdict === 'belum' ? r.verdict !== null : r.verdict?.verdict !== verdict) return false
      }
      if (move === 'naik' && !((r.changePct ?? 0) > 0)) return false
      if (move === 'turun' && !((r.changePct ?? 0) < 0)) return false
      return true
    })
    const val = (r: MarketRow): number | string => {
      if (sort === 'symbol') return r.symbol
      if (sort === 'change') return r.changePct ?? -Infinity
      if (sort === 'confidence') return r.verdict?.confidence ?? -Infinity
      return r.scores[horizon]?.score ?? -Infinity
    }
    out.sort((a, b) => {
      const x = val(a)
      const y = val(b)
      const cmp = typeof x === 'string' ? x.localeCompare(y as string) : (x as number) - (y as number)
      return desc ? -cmp : cmp
    })
    return out
  }, [rows, query, assetClass, horizon, minScore, verdict, move, scoredOnly, sort, desc])

  function header(key: SortKey, label: string, num = true) {
    const active = sort === key
    return (
      <th className={num ? 'num' : undefined}>
        <button
          type="button"
          onClick={() => {
            if (active) setDesc(!desc)
            else {
              setSort(key)
              setDesc(key !== 'symbol')
            }
          }}
          style={{ color: active ? 'var(--ink)' : undefined, letterSpacing: 'inherit', textTransform: 'inherit', font: 'inherit' }}
        >
          {label}
          {active ? (desc ? ' ↓' : ' ↑') : ''}
        </button>
      </th>
    )
  }

  function reset() {
    setQuery('')
    setAssetClass('semua')
    setMinScore(-10)
    setVerdict('semua')
    setMove('semua')
    setScoredOnly(false)
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <span className="panel-title">
          <IconFilter size={14} />
          Saringan
        </span>
        <span className="panel-meta">
          {filtered.length} dari {rows.length} instrumen
        </span>
      </div>
      <div className="panel-body" style={{ borderBottom: '1px solid var(--line)' }}>
        <div className="form-row">
          <label className="field" style={{ flex: '2 1 200px' }}>
            <span className="field-label">Cari</span>
            <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="simbol, nama, sektor" />
          </label>
          <label className="field" style={{ flex: '1 1 130px' }}>
            <span className="field-label">Kelas aset</span>
            <select className="select" value={assetClass} onChange={(e) => setAssetClass(e.target.value)}>
              <option value="semua">Semua</option>
              {classes.map((c) => (
                <option key={c} value={c}>
                  {ASSET_CLASS_LABEL[c] ?? c}
                </option>
              ))}
            </select>
          </label>
          <label className="field" style={{ flex: '1 1 120px' }}>
            <span className="field-label">Horizon skor</span>
            <select className="select" value={horizon} onChange={(e) => setHorizon(e.target.value as Horizon)}>
              <option value="pendek">Pendek</option>
              <option value="menengah">Menengah</option>
              <option value="panjang">Panjang</option>
            </select>
          </label>
          <label className="field" style={{ flex: '1 1 160px' }}>
            <span className="field-label">Skor minimal: {minScore > -10 ? minScore : 'bebas'}</span>
            <input
              type="range"
              min={-10}
              max={10}
              step={0.5}
              value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value))}
            />
          </label>
          <label className="field" style={{ flex: '1 1 150px' }}>
            <span className="field-label">Putusan komite</span>
            <select className="select" value={verdict} onChange={(e) => setVerdict(e.target.value)}>
              <option value="semua">Semua</option>
              <option value="beli">Bukti positif</option>
              <option value="tahan">Bukti berimbang</option>
              <option value="jual">Bukti negatif</option>
              <option value="abstain">Tidak dinilai</option>
              <option value="belum">Belum ada rapat</option>
            </select>
          </label>
          <label className="field" style={{ flex: '1 1 110px' }}>
            <span className="field-label">Harian</span>
            <select className="select" value={move} onChange={(e) => setMove(e.target.value as typeof move)}>
              <option value="semua">Semua</option>
              <option value="naik">Naik</option>
              <option value="turun">Turun</option>
            </select>
          </label>
          <label className="field" style={{ flex: '0 0 auto', alignSelf: 'center' }}>
            <span className="field-label">&nbsp;</span>
            <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 12, color: 'var(--ink-soft)' }}>
              <input type="checkbox" checked={scoredOnly} onChange={(e) => setScoredOnly(e.target.checked)} />
              hanya yang berskor
            </span>
          </label>
          <button type="button" className="btn" onClick={reset}>
            Atur ulang
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Blank icon={<IconFilter size={22} />} title="Tidak ada yang lolos saringan">
          Longgarkan salah satu syarat di atas.
        </Blank>
      ) : (
        <div className="scroll-x">
          <table className="grid">
            <thead>
              <tr>
                {header('symbol', 'Simbol', false)}
                <th>Nama</th>
                <th>Kelas</th>
                <th className="num">Penutupan</th>
                {header('change', 'Harian')}
                {header('score', `Skor ${horizon}`)}
                <th>Keyakinan skor</th>
                <th>Putusan komite</th>
                {header('confidence', 'Keyakinan komite')}
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td className="key">
                    <Link href={`/ringkasan?symbol=${encodeURIComponent(r.symbol)}`}>{r.symbol}</Link>
                  </td>
                  <td>{r.name}</td>
                  <td className="dim">{ASSET_CLASS_LABEL[r.assetClass] ?? r.assetClass}</td>
                  <td className="num">{formatPriceIn(r.lastClose, r.currency)}</td>
                  <td className="num">
                    <ChangeText value={r.changePct} />
                  </td>
                  <td className="num">
                    <ScoreText value={r.scores[horizon]?.score} />
                  </td>
                  <td className="dim">{r.scores[horizon]?.confidence ?? '—'}</td>
                  <td>
                    <VerdictTag verdict={r.verdict?.verdict} />
                  </td>
                  <td className="num">{r.verdict?.confidence != null ? `${r.verdict.confidence}/100` : '—'}</td>
                  <td>
                    <WatchToggle instrumentId={r.id} initialOn={watch.has(r.id)} compact />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
