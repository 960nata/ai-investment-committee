'use client'

/** Form catatan kas manual dan tombol hapusnya. */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { IconPlus, IconTrash } from '@/components/icons'
import styles from './project.module.css'

type Kind = 'masuk' | 'keluar'

export function LedgerForm({ categories, today }: { categories: Record<Kind, string[]>; today: string }) {
  const router = useRouter()
  const [kind, setKind] = useState<Kind>('keluar')
  const [category, setCategory] = useState(categories.keluar[0])
  const [amount, setAmount] = useState('')
  const [entryDate, setEntryDate] = useState(today)
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const value = Number(amount.replace(/\D/g, ''))
    if (!value) return setError('Jumlah harus lebih dari nol')
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/v1/admin/keuangan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind, category, amount: value, entryDate, description }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
      setAmount('')
      setDescription('')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <label className={styles.field}>
        Jenis
        <select
          className={styles.input}
          value={kind}
          onChange={(e) => {
            const next = e.target.value as Kind
            setKind(next)
            setCategory(categories[next][0])
          }}
        >
          <option value="keluar">Pengeluaran</option>
          <option value="masuk">Pemasukan</option>
        </select>
      </label>
      <label className={styles.field}>
        Kategori
        <select className={styles.input} value={category} onChange={(e) => setCategory(e.target.value)}>
          {categories[kind].map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.field}>
        Jumlah (Rp)
        <input
          className={styles.input}
          inputMode="numeric"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/\D/g, '') ? Number(e.target.value.replace(/\D/g, '')).toLocaleString('id-ID') : '')}
          placeholder="150.000"
        />
      </label>
      <label className={styles.field}>
        Tanggal
        <input className={styles.input} type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
      </label>
      <label className={`${styles.field} ${styles.wide}`}>
        Keterangan
        <input className={styles.input} value={description} maxLength={255} onChange={(e) => setDescription(e.target.value)} placeholder="mis. Vercel Pro Oktober" />
      </label>
      <button className={`${styles.btn} ${styles.btnPrimary}`} disabled={busy}>
        <IconPlus size={12} /> {busy ? 'Menyimpan…' : 'Catat'}
      </button>
      {error && <p className={`${styles.notice} ${styles.noticeBad} ${styles.wide}`}>{error}</p>}
    </form>
  )
}

export function LedgerDelete({ id }: { id: number }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  return (
    <button
      className={`${styles.btn} ${styles.btnDanger}`}
      disabled={busy}
      aria-label="Hapus catatan"
      onClick={async () => {
        if (!confirm('Hapus catatan kas ini?')) return
        setBusy(true)
        const res = await fetch(`/api/v1/admin/keuangan?id=${id}`, { method: 'DELETE' })
        setBusy(false)
        if (res.ok) router.refresh()
        else alert('Gagal menghapus catatan.')
      }}
    >
      <IconTrash size={12} />
    </button>
  )
}
