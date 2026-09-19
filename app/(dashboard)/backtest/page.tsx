/**
 * Halaman backtest.
 *
 * Menjawab pertanyaan yang paling menentukan apakah seluruh sistem ini layak
 * dipercaya: apakah skornya punya daya prediksi sama sekali.
 *
 * Yang ditampilkan lebih dulu bukan angkanya, melainkan kesimpulannya — dan
 * paling sering kesimpulannya "belum teruji". Angka hit rate dan IC yang
 * dipajang tanpa jumlah pengamatan bebasnya adalah cara paling halus
 * menyesatkan orang, karena angkanya benar dan kesimpulannya tidak ada.
 */

import { IconAlert, IconGauge, IconLayers } from '@/components/icons'
import { Blank, DatabaseNotice, Tag } from '@/components/ui'
import { listBacktestRuns } from '@/lib/db/queries'
import { describeIc, type EvaluationResult } from '@/lib/backtest/metrics'
import type { FeatureIc } from '@/lib/backtest/runner'
import { HORIZONS } from '@/lib/scoring/weights'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Backtest' }

interface Metrics {
  horizons: Record<string, EvaluationResult>
  featureIc: Record<string, FeatureIc[]>
  byRegime: Record<string, Record<string, EvaluationResult>>
}

export default async function BacktestPage() {
  let runs: Awaited<ReturnType<typeof listBacktestRuns>> = []
  let error: string | null = null

  try {
    runs = await listBacktestRuns(5)
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
  }

  const latest = runs[0]
  const metrics = latest ? (latest.metrics as unknown as Metrics) : null
  const config = latest ? (latest.config as { instruments?: number; from?: string; to?: string }) : null

  return (
    <>
      <header className="masthead">
        <p className="eyebrow">Pengukuran</p>
        <h1 className="headline">Backtest</h1>
        <p className="standfirst">
          Apakah skornya punya daya prediksi. Selama jawabannya belum, probabilitas tidak
          ditampilkan di mana pun dan bobotnya tetap tebakan.
        </p>
      </header>

      {error && <DatabaseNotice detail={error} />}

      {!error && !latest && (
        <section className="panel">
          <Blank icon={<IconGauge size={22} />} title="Belum pernah dijalankan">
            Jalankan <code>npm run backtest US</code> setelah skornya terhitung.
          </Blank>
        </section>
      )}

      {metrics && latest && (
        <>
          <div className="statusbar">
            <span className="status-item">
              {config?.instruments ?? 0} instrumen · {config?.from ?? '—'} sampai {config?.to ?? '—'}
            </span>
            <span className="status-item">model {latest.modelVersion}</span>
            <span className="status-item">fitur {latest.featureSetVersion}</span>
            <span className="status-spacer mono" style={{ fontSize: 'var(--t-small)', color: 'var(--ink-faint)' }}>
              {latest.runAt.toISOString().slice(0, 16).replace('T', ' ')} UTC
            </span>
          </div>

          <section className="panel">
            <div className="panel-head">
              <span className="panel-title">
                <IconGauge size={14} />
                Kesimpulan per horizon
              </span>
            </div>
            <div className="scroll-x">
              <table className="grid">
                <thead>
                  <tr>
                    <th>Horizon</th>
                    <th>Kesimpulan</th>
                    <th className="num">Periode bebas</th>
                    <th className="num">Hit rate</th>
                    <th className="num">Naif</th>
                    <th className="num">IC</th>
                    <th className="num">ICIR</th>
                  </tr>
                </thead>
                <tbody>
                  {HORIZONS.map(({ id, label, days }) => {
                    const m = metrics.horizons[id]
                    if (!m) return null
                    return (
                      <tr key={id}>
                        <td className="key">
                          {label}
                          <span className="dim" style={{ marginLeft: 8, fontSize: 'var(--t-small)' }}>
                            {days} hari
                          </span>
                        </td>
                        <td><VerdictTag verdict={m.verdict} /></td>
                        <td className="num">{m.effectiveN}</td>
                        <td className="num">{pct(m.hitRate)}</td>
                        <td className="num dim">{pct(m.baseRate)}</td>
                        <td className="num">{num(m.ic, 3)}</td>
                        <td className="num dim">{num(m.icir, 2)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {Object.values(metrics.horizons).some((m) => m.verdict.kind === 'belum teruji') && (
              <div className="caveat">
                <IconAlert size={14} />
                <span>
                  Angka di atas tidak boleh dipakai mengambil keputusan selama periode bebasnya
                  masih di bawah ambang. Selisih hit rate beberapa poin pada sampel sependek ini
                  tidak bisa dibedakan dari kebetulan.
                </span>
              </div>
            )}
          </section>

          <section className="panel">
            <div className="panel-head">
              <span className="panel-title">
                <IconLayers size={14} />
                Daya prediksi tiap fitur
              </span>
              <span className="panel-meta">horizon menengah</span>
            </div>
            <div className="scroll-x">
              <table className="grid">
                <thead>
                  <tr>
                    <th>Fitur</th>
                    <th className="num">IC</th>
                    <th>Tafsiran</th>
                    <th className="num">Pengamatan</th>
                  </tr>
                </thead>
                <tbody>
                  {(metrics.featureIc.menengah ?? []).slice(0, 12).map((f) => (
                    <tr key={f.feature}>
                      <td>{f.label}</td>
                      <td className="num">{num(f.ic, 4)}</td>
                      <td className="dim">{describeIc(f.ic)}</td>
                      <td className="num dim">{f.n.toLocaleString('id-ID')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <span className="panel-title">
                <IconGauge size={14} />
                Per kondisi pasar
              </span>
              <span className="panel-meta">horizon menengah</span>
            </div>
            <div className="scroll-x">
              <table className="grid">
                <thead>
                  <tr>
                    <th>Kondisi</th>
                    <th className="num">Pengamatan</th>
                    <th className="num">Hit rate</th>
                    <th className="num">IC</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(metrics.byRegime.menengah ?? {}).map(([regime, m]) => (
                    <tr key={regime}>
                      <td className="key">{regime}</td>
                      <td className="num">{m.n.toLocaleString('id-ID')}</td>
                      <td className="num">{pct(m.hitRate)}</td>
                      <td className="num">{num(m.ic, 3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="caveat">
              <IconAlert size={14} />
              <span>
                Banyak sinyal terlihat hebat karena kebetulan diuji di periode pasar naik saja.
                Baris pasar turun yang mengungkap mana yang sekadar mengikuti arus.
              </span>
            </div>
          </section>
        </>
      )}
    </>
  )
}

function VerdictTag({ verdict }: { verdict: EvaluationResult['verdict'] }) {
  const tone =
    verdict.kind === 'unggul' ? 'ok' : verdict.kind === 'kalah dari naif' ? 'down' : 'warn'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <Tag tone={tone}>{verdict.kind}</Tag>
      <span className="dim" style={{ fontSize: 'var(--t-small)' }}>{verdict.reason}</span>
    </span>
  )
}

function pct(v: number | null): string {
  return v === null ? '—' : `${(v * 100).toFixed(1)}%`
}

function num(v: number | null, digits: number): string {
  return v === null ? '—' : v.toFixed(digits)
}
