'use client'

import { useState } from 'react'
import {
  IconTarget,
  IconCheck,
  IconAlert,
  IconEye,
  IconEyeOff,
  IconExternalLink,
} from '@/components/icons'
import type { AdSettingsRow } from '@/lib/db/schema'

export function AdsManagerClient({ initialSlots }: { initialSlots: AdSettingsRow[] }) {
  const [slots, setSlots] = useState<AdSettingsRow[]>(initialSlots)
  const [savingSlot, setSavingSlot] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)

  function handleFieldChange<K extends keyof AdSettingsRow>(
    slotName: string,
    field: K,
    val: AdSettingsRow[K],
  ) {
    setSlots((prev) =>
      prev.map((s) => (s.slotName === slotName ? { ...s, [field]: val } : s)),
    )
  }

  async function handleSave(slot: AdSettingsRow) {
    setSavingSlot(slot.slotName)
    setFeedback(null)

    try {
      const res = await fetch('/api/v1/admin/ads', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slotName: slot.slotName,
          isEnabled: slot.isEnabled,
          title: slot.title,
          description: slot.description,
          adCodeHtml: slot.adCodeHtml,
          targetUrl: slot.targetUrl,
          imageUrl: slot.imageUrl,
          sponsorName: slot.sponsorName,
        }),
      })

      const data = await res.json()
      if (res.ok && data.ok) {
        setFeedback(`Pengaturan slot "${slot.title}" berhasil disimpan.`)
        setTimeout(() => setFeedback(null), 3000)
      } else {
        alert(data.error || 'Gagal menyimpan pengaturan iklan.')
      }
    } catch {
      alert('Kesalahan koneksi saat menyimpan pengaturan iklan.')
    } finally {
      setSavingSlot(null)
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

      {/* Informasi Protokol Iklan */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '12px 16px',
          background: 'var(--surface-2)',
          border: '1px solid var(--line)',
          borderRadius: 'var(--radius-sm)',
          marginBottom: '20px',
        }}
      >
        <div
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: 'var(--signal)',
            boxShadow: '0 0 8px var(--signal)',
            flexShrink: 0,
          }}
        />
        <div style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>
          <strong style={{ color: 'var(--ink)' }}>Default Status: Hidden (Aman).</strong> Seluruh 4 slot iklan
          strategis berada dalam keadaan nonaktif secara bawaan. Anda dapat mengaktifkan slot mana pun secara selektif
          atau memasukkan script Google AdSense / tautan sponsor afiliasi di bawah ini.
        </div>
      </div>

      {/* Daftar 4 Slot Strategis */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {slots.map((slot) => {
          const isSaving = savingSlot === slot.slotName

          return (
            <div
              key={slot.id}
              className="admin-card"
              style={{
                border: slot.isEnabled ? '1px solid var(--green)' : '1px solid var(--line)',
                background: 'var(--surface-1)',
              }}
            >
              {/* Header Kartu Slot */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  marginBottom: '16px',
                  flexWrap: 'wrap',
                  gap: '12px',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="mono" style={{ fontSize: '10px', color: 'var(--ink-faint)', textTransform: 'uppercase' }}>
                      Slot: {slot.slotName}
                    </span>
                    <span
                      className="tag mono"
                      style={{
                        fontSize: '10px',
                        color: slot.isEnabled ? 'var(--green)' : 'var(--ink-mute)',
                        borderColor: slot.isEnabled ? 'rgba(34,197,94,0.3)' : 'var(--line)',
                      }}
                    >
                      {slot.isEnabled ? '● TAMPIL (AKTIF)' : '○ TERSEMBUNYI (OFF)'}
                    </span>
                  </div>
                  <h3 style={{ fontSize: '16px', fontWeight: 600, margin: '4px 0 2px' }}>
                    {slot.title}
                  </h3>
                  <p className="mono" style={{ fontSize: '11px', color: 'var(--ink-mute)', margin: 0 }}>
                    {slot.description}
                  </p>
                </div>

                {/* Sakelar On/Off Kotak */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span className="mono" style={{ fontSize: '11px', color: slot.isEnabled ? 'var(--green)' : 'var(--ink-faint)' }}>
                    {slot.isEnabled ? 'Aktif' : 'Nonaktif'}
                  </span>
                  <label className="admin-switch">
                    <input
                      type="checkbox"
                      checked={slot.isEnabled}
                      onChange={(e) => handleFieldChange(slot.slotName, 'isEnabled', e.target.checked)}
                    />
                    <span className="admin-slider" />
                  </label>
                </div>
              </div>

              {/* Form Konfigurasi Iklan */}
              <div style={{ display: 'grid', gap: '12px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                  <div>
                    <label className="mono" style={{ display: 'block', fontSize: '11px', color: 'var(--ink-soft)', marginBottom: '4px' }}>
                      Nama Sponsor / Brand:
                    </label>
                    <input
                      type="text"
                      value={slot.sponsorName || ''}
                      onChange={(e) => handleFieldChange(slot.slotName, 'sponsorName', e.target.value)}
                      placeholder="Contoh: Sponsor Terverifikasi / Platform Riset"
                      style={{
                        width: '100%',
                        padding: '6px 10px',
                        background: 'var(--surface-0)',
                        border: '1px solid var(--line)',
                        borderRadius: 'var(--radius-sm)',
                        color: 'var(--ink)',
                        fontSize: '12px',
                      }}
                    />
                  </div>

                  <div>
                    <label className="mono" style={{ display: 'block', fontSize: '11px', color: 'var(--ink-soft)', marginBottom: '4px' }}>
                      Target URL (Tautan Afiliasi / Web):
                    </label>
                    <input
                      type="url"
                      value={slot.targetUrl || ''}
                      onChange={(e) => handleFieldChange(slot.slotName, 'targetUrl', e.target.value)}
                      placeholder="https://..."
                      className="mono"
                      style={{
                        width: '100%',
                        padding: '6px 10px',
                        background: 'var(--surface-0)',
                        border: '1px solid var(--line)',
                        borderRadius: 'var(--radius-sm)',
                        color: 'var(--ink)',
                        fontSize: '12px',
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label className="mono" style={{ display: 'block', fontSize: '11px', color: 'var(--ink-soft)', marginBottom: '4px' }}>
                    Banner Image URL (Opsional jika berupa gambar sponsor):
                  </label>
                  <input
                    type="url"
                    value={slot.imageUrl || ''}
                    onChange={(e) => handleFieldChange(slot.slotName, 'imageUrl', e.target.value)}
                    placeholder="https://.../banner.jpg"
                    className="mono"
                    style={{
                      width: '100%',
                      padding: '6px 10px',
                      background: 'var(--surface-0)',
                      border: '1px solid var(--line)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--ink)',
                      fontSize: '12px',
                    }}
                  />
                </div>

                <div>
                  <label className="mono" style={{ display: 'block', fontSize: '11px', color: 'var(--ink-soft)', marginBottom: '4px' }}>
                    Kode Script HTML / Google AdSense Tag (Opsional):
                  </label>
                  <textarea
                    rows={3}
                    value={slot.adCodeHtml || ''}
                    onChange={(e) => handleFieldChange(slot.slotName, 'adCodeHtml', e.target.value)}
                    placeholder="<!-- Tempel script AdSense / responsif tag iklan di sini -->"
                    className="mono"
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      background: 'var(--surface-0)',
                      border: '1px solid var(--line)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--ink)',
                      fontSize: '11px',
                      lineHeight: 1.4,
                    }}
                  />
                </div>

                {/* Bar Tombol Simpan Slot */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginTop: '4px' }}>
                  <button
                    type="button"
                    onClick={() => handleSave(slot)}
                    disabled={isSaving}
                    className="btn btn-primary"
                    style={{ padding: '6px 14px', fontSize: '12px', fontFamily: 'var(--mono)' }}
                  >
                    {isSaving ? 'Menyimpan...' : 'Simpan Pengaturan Slot'}
                    <IconCheck size={12} />
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
