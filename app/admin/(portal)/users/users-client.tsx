'use client'

import { useState } from 'react'
import {
  IconUser,
  IconShield,
  IconCheck,
  IconAlert,
  IconTrash,
  IconPlus,
} from '@/components/icons'
// Sengaja tipe tanpa sidik kata sandi: barisnya sampai ke peramban, dan tipe
// yang memuat kolom itu akan membuat pengirimannya terlihat wajar.
import type { PublicAppUser } from '@/lib/db/news-queries'

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
    <div>
      {feedback && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 14px',
            background: 'var(--measured-dim)',
            border: '1px solid var(--measured)',
            borderRadius: 'var(--radius-sm)',
            marginBottom: '16px',
            fontSize: '13px',
          }}
        >
          <IconCheck size={16} style={{ color: 'var(--measured)' }} />
          <span>{feedback}</span>
        </div>
      )}

      {/* Matriks Perbedaan Hak Akses User vs Admin */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '16px',
          marginBottom: '24px',
        }}
      >
        <div className="admin-card" style={{ marginBottom: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <span className="tag mono" style={{ color: 'var(--blue)', borderColor: 'rgba(59,130,246,0.3)' }}>
              Hak Akses: User Biasa (Analis / Reader)
            </span>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--ink-soft)', lineHeight: 1.5, margin: 0 }}>
            ● Memantau terminal kuantitatif 448 instrumen dan grafik candlestick realtime.<br />
            ● Membaca putusan resmi komite &amp; transkrip dialektika 4 agen AI.<br />
            ● Membaca artikel warta intelijen pasar dan menjalankan simulasi backtest.<br />
            <span style={{ color: 'var(--ink-faint)' }}>✕ Tidak dapat mengubah artikel berita, mengatur iklan, atau mengubah data user.</span>
          </p>
        </div>

        <div className="admin-card" style={{ marginBottom: 0, border: '1px solid var(--signal)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <span className="tag mono" style={{ color: 'var(--signal)', borderColor: 'rgba(224,161,60,0.3)' }}>
              Hak Akses: Administrator Komite
            </span>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--ink-soft)', lineHeight: 1.5, margin: 0 }}>
            ● Memiliki seluruh hak akses User biasa.<br />
            ● Membuat, mengedit, dan menghapus artikel warta di CMS Redaksi.<br />
            ● Mengunggah gambar aset berita langsung ke Supabase Storage.<br />
            ● Mengontrol player video YouTube dan visibilitasnya.<br />
            ● Mengatur &amp; menyalakan/mematikan 4 slot iklan AdSense.<br />
            ● Mengelola peran akun dan mendaftarkan analis baru.
          </p>
        </div>
      </div>

      {/* Tabel Pengguna */}
      <div className="admin-card">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '16px',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div>
            <h2 style={{ fontSize: '15px', fontWeight: 600, margin: 0 }}>Daftar Akun Pengguna</h2>
            <p className="mono" style={{ fontSize: '11px', color: 'var(--ink-mute)', margin: '2px 0 0' }}>
              Total: {users.length} pengguna terdata
            </p>
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

        {/* Modal / Form Tambah User */}
        {showAddModal && (
          <div
            style={{
              padding: '16px',
              background: 'var(--surface-0)',
              border: '1px solid var(--line-strong)',
              borderRadius: 'var(--radius-sm)',
              marginBottom: '20px',
            }}
          >
            <h3 style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 12px' }}>
              Registrasi Akun Pengguna Baru
            </h3>
            <form onSubmit={handleAddUserSubmit} style={{ display: 'grid', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                <div>
                  <label className="mono" style={{ display: 'block', fontSize: '11px', color: 'var(--ink-soft)', marginBottom: '4px' }}>
                    Alamat Email:*
                  </label>
                  <input
                    type="email"
                    required
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="analis@perusahaan.com"
                    style={{
                      width: '100%',
                      padding: '6px 10px',
                      background: 'var(--surface-1)',
                      border: '1px solid var(--line)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--ink)',
                      fontSize: '13px',
                    }}
                  />
                </div>

                <div>
                  <label className="mono" style={{ display: 'block', fontSize: '11px', color: 'var(--ink-soft)', marginBottom: '4px' }}>
                    Nama Lengkap / Panggilan:
                  </label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Nama Pengguna"
                    style={{
                      width: '100%',
                      padding: '6px 10px',
                      background: 'var(--surface-1)',
                      border: '1px solid var(--line)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--ink)',
                      fontSize: '13px',
                    }}
                  />
                </div>

                <div>
                  <label className="mono" style={{ display: 'block', fontSize: '11px', color: 'var(--ink-soft)', marginBottom: '4px' }}>
                    Peran (Role):*
                  </label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as 'admin' | 'user')}
                    style={{
                      width: '100%',
                      padding: '6px 10px',
                      background: 'var(--surface-1)',
                      border: '1px solid var(--line)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--ink)',
                      fontSize: '13px',
                    }}
                  >
                    <option value="user">User Biasa (Read-Only Analisis)</option>
                    <option value="admin">Administrator (Akses Penuh CMS &amp; Ads)</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
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
          </div>
        )}

        {/* Tabel User */}
        <div style={{ overflowX: 'auto' }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th style={{ width: '40px' }}>ID</th>
                <th>Nama &amp; Email</th>
                <th>Peran (Role)</th>
                <th>Status</th>
                <th>Terdaftar</th>
                <th style={{ textAlign: 'right' }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td className="mono" style={{ fontSize: '11px', color: 'var(--ink-faint)' }}>
                    #{user.id}
                  </td>
                  <td>
                    <div style={{ fontWeight: 600, fontSize: '13px' }}>{user.name}</div>
                    <div className="mono" style={{ fontSize: '11px', color: 'var(--ink-mute)' }}>
                      {user.email}
                    </div>
                  </td>
                  <td>
                    <select
                      value={user.role}
                      onChange={(e) => handleRoleChange(user.id, e.target.value as 'admin' | 'user')}
                      className="mono"
                      style={{
                        padding: '3px 8px',
                        background: user.role === 'admin' ? 'rgba(224,161,60,0.15)' : 'var(--surface-0)',
                        color: user.role === 'admin' ? 'var(--signal)' : 'var(--ink)',
                        border: '1px solid var(--line)',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '11px',
                        cursor: 'pointer',
                      }}
                    >
                      <option value="user">user</option>
                      <option value="admin">admin</option>
                    </select>
                  </td>
                  <td>
                    <button
                      type="button"
                      onClick={() => handleStatusToggle(user.id, user.isActive)}
                      className="tag mono"
                      style={{
                        fontSize: '10px',
                        cursor: 'pointer',
                        color: user.isActive ? 'var(--green)' : 'var(--halted)',
                        borderColor: user.isActive ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)',
                        background: 'none',
                      }}
                      title="Klik untuk mengubah status aktif"
                    >
                      {user.isActive ? '● Aktif' : '○ Dinonaktifkan'}
                    </button>
                  </td>
                  <td className="mono" style={{ fontSize: '11px', color: 'var(--ink-mute)' }}>
                    {new Date(user.createdAt).toLocaleDateString('id-ID', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      type="button"
                      onClick={() => handleDelete(user.id, user.email)}
                      className="btn btn-quiet"
                      style={{ padding: '3px 6px', color: 'var(--halted)' }}
                      title="Hapus user"
                    >
                      <IconTrash size={12} />
                    </button>
                  </td>
                </tr>
              ))}

              {users.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '24px', color: 'var(--ink-mute)' }}>
                    Belum ada pengguna terdaftar.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
