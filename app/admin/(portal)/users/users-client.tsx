'use client'

import { useState } from 'react'
import { IconCheck, IconTrash, IconPlus } from '@/components/icons'
// Sengaja tipe tanpa sidik kata sandi: barisnya sampai ke peramban, dan tipe
// yang memuat kolom itu akan membuat pengirimannya terlihat wajar.
import type { PublicAppUser } from '@/lib/db/news-queries'
import styles from './users.module.css'

export function UsersClient({ initialUsers }: { initialUsers: PublicAppUser[] }) {
  const [users, setUsers] = useState<PublicAppUser[]>(initialUsers)
  const [feedback, setFeedback] = useState<string | null>(null)

  // Form Tambah User
  const [showAddModal, setShowAddModal] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newName, setNewName] = useState('')
  const [newRole, setNewRole] = useState<'admin' | 'user'>('user')
  const [addingUser, setAddingUser] = useState(false)

  async function handleRoleChange(id: number, role: 'admin' | 'user') {
    try {
      const res = await fetch('/api/v1/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, role }),
      })
      const data = await res.json()
      if (res.ok && data.ok) {
        setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, role } : u)))
        setFeedback(`Peran pengguna #${id} berhasil diubah menjadi ${role}.`)
        setTimeout(() => setFeedback(null), 3000)
      } else {
        alert(data.error || 'Gagal mengubah peran pengguna.')
      }
    } catch {
      alert('Kesalahan jaringan saat mengubah peran pengguna.')
    }
  }

  async function handleStatusToggle(id: number, currentActive: boolean) {
    try {
      const res = await fetch('/api/v1/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, isActive: !currentActive }),
      })
      const data = await res.json()
      if (res.ok && data.ok) {
        setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, isActive: !currentActive } : u)))
        setFeedback(`Status pengguna #${id} diperbarui.`)
        setTimeout(() => setFeedback(null), 3000)
      } else {
        alert(data.error || 'Gagal mengubah status pengguna.')
      }
    } catch {
      alert('Kesalahan jaringan saat mengubah status pengguna.')
    }
  }

  async function handleDelete(id: number, email: string) {
    if (!confirm(`Hapus akun pengguna "${email}"? Tindakan ini tidak dapat dibatalkan.`)) return

    try {
      const res = await fetch(`/api/v1/admin/users?id=${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (res.ok && data.ok) {
        setUsers((prev) => prev.filter((u) => u.id !== id))
        setFeedback(`Pengguna ${email} telah dihapus.`)
        setTimeout(() => setFeedback(null), 3000)
      } else {
        alert(data.error || 'Gagal menghapus pengguna.')
      }
    } catch {
      alert('Kesalahan jaringan saat menghapus pengguna.')
    }
  }

  async function handleAddUserSubmit(e: React.FormEvent) {
    e.preventDefault()
    setAddingUser(true)

    try {
      const res = await fetch('/api/v1/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newEmail.trim(),
          name: newName.trim(),
          role: newRole,
        }),
      })

      const data = await res.json()
      if (res.ok && data.ok) {
        setUsers((prev) => [data.data, ...prev])
        setFeedback(`Pengguna baru ${data.data.email} berhasil ditambahkan!`)
        setShowAddModal(false)
        setNewEmail('')
        setNewName('')
        setNewRole('user')
        setTimeout(() => setFeedback(null), 3000)
      } else {
        alert(data.error || 'Gagal menambahkan pengguna.')
      }
    } catch {
      alert('Kesalahan jaringan saat menambahkan pengguna.')
    } finally {
      setAddingUser(false)
    }
  }

  return (
    <div className={styles.page}>
      {feedback && (
        <div className={styles.feedback}>
          <IconCheck size={16} style={{ color: 'var(--measured)' }} />
          <span>{feedback}</span>
        </div>
      )}

      {/* Matriks Perbedaan Hak Akses User vs Admin */}
      <div className={styles.roles}>
        <section className={styles.roleCard}>
          <span className="tag mono" style={{ color: 'var(--blue)', borderColor: 'rgba(59,130,246,0.3)', justifySelf: 'start' }}>
            Hak Akses: User Biasa (Analis / Reader)
          </span>
          <ul className={styles.roleList}>
            <li>Memantau terminal kuantitatif 448 instrumen dan grafik candlestick realtime.</li>
            <li>Membaca putusan resmi komite &amp; transkrip dialektika 4 agen AI.</li>
            <li>Membaca artikel warta intelijen pasar dan menjalankan simulasi backtest.</li>
            <li className={styles.denied}>Tidak dapat mengubah artikel berita, mengatur iklan, atau mengubah data user.</li>
          </ul>
        </section>

        <section className={`${styles.roleCard} ${styles.roleCardAdmin}`}>
          <span className="tag mono" style={{ color: 'var(--signal)', borderColor: 'rgba(224,161,60,0.3)', justifySelf: 'start' }}>
            Hak Akses: Administrator AI Investdesk
          </span>
          <ul className={styles.roleList}>
            <li>Memiliki seluruh hak akses User biasa.</li>
            <li>Membuat, mengedit, dan menghapus artikel warta di CMS Redaksi.</li>
            <li>Mengunggah gambar aset berita langsung ke Supabase Storage.</li>
            <li>Mengontrol player video YouTube dan visibilitasnya.</li>
            <li>Mengatur &amp; menyalakan/mematikan 4 slot iklan AdSense.</li>
            <li>Mengelola peran akun dan mendaftarkan analis baru.</li>
          </ul>
        </section>
      </div>

      {/* Tabel Pengguna */}
      <section className={styles.listCard}>
        <div className={styles.listHead}>
          <div>
            <h2 className={styles.listTitle}>Daftar Akun Pengguna</h2>
            <p className={`mono ${styles.listCount}`}>Total: {users.length} pengguna terdata</p>
          </div>

          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="btn btn-primary"
            style={{ fontSize: '12px', fontFamily: 'var(--mono)' }}
          >
            <IconPlus size={14} />
            <span>Tambah Pengguna Baru</span>
          </button>
        </div>

        {/* Form Tambah User */}
        {showAddModal && (
          <form onSubmit={handleAddUserSubmit} className={styles.form}>
            <h3 className={styles.formTitle}>Registrasi Akun Pengguna Baru</h3>

            <div className={styles.fields}>
              <label className={styles.field}>
                <span className={`mono ${styles.label}`}>Alamat Email:*</span>
                <input
                  type="email"
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="analis@perusahaan.com"
                  className={styles.input}
                />
              </label>

              <label className={styles.field}>
                <span className={`mono ${styles.label}`}>Nama Lengkap / Panggilan:</span>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Nama Pengguna"
                  className={styles.input}
                />
              </label>

              <label className={styles.field}>
                <span className={`mono ${styles.label}`}>Peran (Role):*</span>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as 'admin' | 'user')}
                  className={styles.input}
                >
                  <option value="user">User Biasa (Read-Only Analisis)</option>
                  <option value="admin">Administrator (Akses Penuh CMS &amp; Ads)</option>
                </select>
              </label>
            </div>

            <div className={styles.formActions}>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="btn btn-quiet"
                style={{ fontSize: '12px' }}
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={addingUser}
                className="btn btn-primary"
                style={{ fontSize: '12px', fontFamily: 'var(--mono)' }}
              >
                {addingUser ? 'Mendaftarkan...' : 'Daftarkan Pengguna'}
              </button>
            </div>
          </form>
        )}

        {/* Tabel User */}
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>ID</th>
                <th>Nama &amp; Email</th>
                <th>Peran (Role)</th>
                <th>Status</th>
                <th>Terdaftar</th>
                <th className={styles.alignRight}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td className={`mono ${styles.idCell}`}>#{user.id}</td>
                  <td>
                    <div className={styles.userName}>{user.name}</div>
                    <div className={`mono ${styles.userEmail}`}>{user.email}</div>
                  </td>
                  <td>
                    <select
                      value={user.role}
                      onChange={(e) => handleRoleChange(user.id, e.target.value as 'admin' | 'user')}
                      className={`mono ${styles.roleSelect} ${user.role === 'admin' ? styles.roleSelectAdmin : ''}`}
                    >
                      <option value="user">user</option>
                      <option value="admin">admin</option>
                    </select>
                  </td>
                  <td>
                    <button
                      type="button"
                      onClick={() => handleStatusToggle(user.id, user.isActive)}
                      className={`tag mono ${styles.status}`}
                      style={{
                        color: user.isActive ? 'var(--green)' : 'var(--halted)',
                        borderColor: user.isActive ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)',
                      }}
                      title="Klik untuk mengubah status aktif"
                    >
                      {user.isActive ? '● Aktif' : '○ Dinonaktifkan'}
                    </button>
                  </td>
                  <td className={`mono ${styles.date}`}>
                    {new Date(user.createdAt).toLocaleDateString('id-ID', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </td>
                  <td className={styles.alignRight}>
                    <button
                      type="button"
                      onClick={() => handleDelete(user.id, user.email)}
                      className={`btn btn-quiet ${styles.deleteBtn}`}
                      title="Hapus user"
                    >
                      <IconTrash size={12} />
                    </button>
                  </td>
                </tr>
              ))}

              {users.length === 0 && (
                <tr>
                  <td colSpan={6} className={styles.empty}>
                    Belum ada pengguna terdaftar.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
