import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAdmin } from '@/lib/auth/admin-auth'
import { getSessionArchive } from '@/lib/db/work-archive-queries'
import styles from '../../archive.module.css'
import { failoverChain, formatWib } from '../../format'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Rincian Sidang — Arsip Kerja AI' }

export default async function SessionArchiveDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin()
  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) notFound()
  const data = await getSessionArchive(id)
  if (!data) notFound()
  const { session, turns, traces } = data

  const tokens = turns.reduce((n, t) => n + (t.inputTokens ?? 0) + (t.outputTokens ?? 0), 0)
  const duration =
    session.finishedAt ? Math.round((session.finishedAt.getTime() - session.startedAt.getTime()) / 1000) : null
  const snapshot = session.factsSnapshot as { asOf?: string; committeeVersion?: string; reusedFromSessionId?: number } | null

  return (
    <div className={`admin-page-content ${styles.page}`}>
      <Link href="/admin/arsip-kerja?tab=sidang" className={styles.back}>
        ← Arsip sidang
      </Link>
      <h1 className="admin-page-headline">
        Sidang #{session.id} · <span className="admin-headline-accent">{session.symbol}</span>
      </h1>

      <div className={styles.summary}>
        <Stat label="Pasar" value={session.market} />
        <Stat label="Status" value={session.status} />
        <Stat label="Putusan" value={session.verdict ?? '—'} />
        <Stat label="Keyakinan" value={session.confidence ?? '—'} />
        <Stat label="Mulai (WIB)" value={formatWib(session.startedAt)} />
        <Stat label="Durasi" value={duration !== null ? `${duration} dtk` : '—'} />
        <Stat label="Token" value={tokens.toLocaleString('id-ID')} />
        <Stat label="Data per" value={snapshot?.asOf ?? '—'} />
      </div>

      {snapshot?.reusedFromSessionId && (
        <p className={styles.prose}>
          Putusan dipakai ulang dari{' '}
          <Link href={`/admin/arsip-kerja/sidang/${snapshot.reusedFromSessionId}`}>sidang #{snapshot.reusedFromSessionId}</Link>{' '}
          karena belum ada candle baru — tidak ada model yang dipanggil.
        </p>
      )}

      {session.rationale && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Alasan putusan</h2>
          <p className={styles.prose}>{session.rationale}</p>
        </section>
      )}
      {session.error && <p className={styles.prose} style={{ color: 'var(--halted)' }}>{session.error}</p>}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Transkrip</h2>
        {turns.length === 0 && <p className={styles.empty}>Tidak ada giliran tercatat.</p>}
        {turns.map((t) => {
          const trace = traces.find((x) => x.step === t.agent)
          return (
            <article key={t.id} className={styles.turn}>
              <header className={styles.turnHead}>
                <span className={styles.turnAgent}>{t.agent.toUpperCase()}</span>
                <span className={styles.mono}>
                  {t.providerId ?? '?'}/{t.model ?? '?'}
                  {t.keyIndex !== null ? ` · kunci #${t.keyIndex}` : ''}
                </span>
                {t.latencyMs !== null && <span>{(t.latencyMs / 1000).toFixed(1)} dtk</span>}
                <span>
                  {t.inputTokens ?? 0}→{t.outputTokens ?? 0} tok
                </span>
                <span>{formatWib(t.createdAt)}</span>
              </header>
              {trace && trace.failovers.length > 0 && (
                <div className={styles.chain}>DIGANTIKAN: {failoverChain(trace.failovers, trace.providerId)}</div>
              )}
              <pre className={styles.turnBody}>{t.content}</pre>
            </article>
          )
        })}
      </section>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className={styles.stat}>
      <div className={styles.statLabel}>{label}</div>
      <div className={styles.statValue}>{value}</div>
    </div>
  )
}
