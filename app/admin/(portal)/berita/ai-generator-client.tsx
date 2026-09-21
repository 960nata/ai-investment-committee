'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { IconBolt, IconClose, IconImage, IconRefresh } from '@/components/icons'

/**
 * Panel redaksi untuk menugaskan agen jurnalis AI.
 *
 * Dulu tombol ini menempel di portal publik, artinya pembaca mana pun bisa
 * membakar kuota LLM dan menerbitkan tulisan atas nama portal. Sekarang ia
 * tinggal di dalam CMS, di belakang sesi admin, tempat keputusan menerbitkan
 * memang dibuat.
 */

const HOT_PRESETS = [
  {
    topic: 'Krisis Listrik AI & Peluang Saham Panas Bumi BREN serta Tembaga AMMN',
    category: 'energi-komoditas' as const,
    symbols: ['NVDA', 'BREN.JK', 'AMMN.JK', 'TSM'],
  },
  {
    topic:
      'Dampak Pemangkasan Suku Bunga The Fed & Bank Indonesia Terhadap Arus Modal Saham Big Cap IHSG',
    category: 'ekonomi-makro' as const,
    symbols: ['BBCA.JK', 'BBRI.JK', 'BTCUSDT', 'GOLD'],
  },
  {
    topic: 'Perang Chip Semikonduktor Global & Valuasi Saham AI Hardware vs Software',
    category: 'teknologi-ai' as const,
    symbols: ['NVDA', 'TSM', 'PLTR', 'ARM'],
  },
  {
    topic: 'Rekor Pembelian Emas Bank Sentral Global dan Perlindungan Portofolio Safe Haven',
    category: 'energi-komoditas' as const,
    symbols: ['GOLD', 'ANTM.JK'],
  },
]

export function AiGeneratorClient() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [selectedPreset, setSelectedPreset] = useState(0)
  const [customTopic, setCustomTopic] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [stage, setStage] = useState('')
  const [isSyncing, setIsSyncing] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleGenerate() {
    setIsGenerating(true)
    setError(null)
    setStage('1/3 · AI jurnalis menyusun naskah & kata kunci foto...')

    // Tahapan ini murni penanda waktu untuk pembaca layar admin; urutan
    // sebenarnya dijaga di server, tempat artikel baru disimpan setelah
    // sampulnya benar-benar terunggah.
    const toPhoto = setTimeout(
      () => setStage('2/3 · Mengunduh foto asli internet, konversi AVIF, unggah Supabase...'),
      5000,
    )
    const toSave = setTimeout(() => setStage('3/3 · Menyimpan artikel ke basis data...'), 14000)

    try {
      const preset = HOT_PRESETS[selectedPreset]
      const topic = customTopic.trim() || preset.topic

      const res = await fetch('/api/v1/news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic,
          category: preset.category,
          targetSymbols: preset.symbols,
        }),
      })

      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error ?? 'Gagal menerbitkan warta AI.')

      setNotice(`Warta "${data.article?.title ?? topic}" berhasil diterbitkan.`)
      setOpen(false)
      setCustomTopic('')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      clearTimeout(toPhoto)
      clearTimeout(toSave)
      setIsGenerating(false)
      setStage('')
    }
  }

  async function handleSyncImages() {
    setIsSyncing(true)
    setNotice(null)
    try {
      const res = await fetch('/api/v1/news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync_images' }),
      })
      const data = await res.json()
      setNotice(
        data.success
          ? `Sinkronisasi selesai: ${data.updated} sampul dikonversi ke AVIF, ${data.skipped} dilewati.`
          : data.error || 'Gagal menyinkronkan sampul.',
      )
    } catch {
      setNotice('Gagal menghubungi server saat sinkronisasi sampul.')
    } finally {
      setIsSyncing(false)
      setTimeout(() => setNotice(null), 6000)
    }
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn mono"
          onClick={handleSyncImages}
          disabled={isSyncing}
          title="Unduh ulang sampul lama, konversi ke AVIF, unggah ke Supabase Storage"
          style={{ padding: '8px 14px', fontSize: '13px' }}
        >
          {isSyncing ? <IconRefresh size={14} /> : <IconImage size={14} />}
          <span>{isSyncing ? 'Menyinkronkan...' : 'Sync Sampul AVIF'}</span>
        </button>

        <button
          type="button"
          className="btn mono"
          onClick={() => setOpen(true)}
          style={{ padding: '8px 14px', fontSize: '13px' }}
        >
          <IconBolt size={14} />
          <span>Tugaskan AI Jurnalis</span>
        </button>
      </div>

      {notice && (
        <div
          className="mono"
          style={{
            marginTop: '10px',
            padding: '8px 12px',
            border: '1px solid var(--line)',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--bg-subtle)',
            fontSize: '12px',
            color: 'var(--ink-mute)',
          }}
        >
          {notice}
        </div>
      )}

      {open && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.72)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 999,
            padding: 16,
          }}
        >
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--line)',
              borderRadius: 'var(--radius-md)',
              maxWidth: 580,
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: 'var(--space-5)',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--ink)' }}>
                Tugaskan AI Jurnalis
              </h3>
              <button
                type="button"
                onClick={() => !isGenerating && setOpen(false)}
                disabled={isGenerating}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--ink-mute)',
                  cursor: isGenerating ? 'not-allowed' : 'pointer',
                }}
              >
                <IconClose size={16} />
              </button>
            </div>

            <p
              style={{
                fontSize: 'var(--t-small)',
                color: 'var(--ink-mute)',
                margin: 0,
                lineHeight: 1.55,
              }}
            >
              AI menulis naskah dan merumuskan kata kunci foto. Foto sampulnya dicari dari
              internet, diunduh, dikonversi ke AVIF, lalu diunggah ke Supabase Storage.
              Artikel baru disimpan <strong>setelah</strong> sampulnya berhasil terunggah.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label
                className="mono"
                style={{
                  fontSize: 'var(--t-micro)',
                  fontWeight: 600,
                  color: 'var(--ink-mute)',
                  textTransform: 'uppercase',
                }}
              >
                Tema Riset
              </label>
              {HOT_PRESETS.map((preset, idx) => (
                <button
                  key={preset.topic}
                  type="button"
                  onClick={() => setSelectedPreset(idx)}
                  style={{
                    textAlign: 'left',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-sm)',
                    border:
                      selectedPreset === idx ? '1px solid var(--signal)' : '1px solid var(--line)',
                    background: selectedPreset === idx ? 'var(--bg-subtle)' : 'transparent',
                    cursor: 'pointer',
                    fontSize: 'var(--t-small)',
                    color: 'var(--ink)',
                  }}
                >
                  <div style={{ fontWeight: 500 }}>{preset.topic}</div>
                  <div
                    className="mono"
                    style={{ fontSize: 'var(--t-micro)', color: 'var(--ink-mute)', marginTop: 4 }}
                  >
                    {preset.symbols.join(', ')}
                  </div>
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label
                className="mono"
                style={{
                  fontSize: 'var(--t-micro)',
                  fontWeight: 600,
                  color: 'var(--ink-mute)',
                  textTransform: 'uppercase',
                }}
              >
                Atau Topik Mandiri
              </label>
              <input
                type="text"
                placeholder="Misal: Dampak Kebijakan Ekspor Nikel ke Saham NCKL..."
                value={customTopic}
                onChange={(e) => setCustomTopic(e.target.value)}
                disabled={isGenerating}
                style={{
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--line)',
                  background: 'var(--bg-subtle)',
                  color: 'var(--ink)',
                  fontSize: 'var(--t-small)',
                }}
              />
            </div>

            {error && (
              <div
                style={{
                  padding: '8px 12px',
                  border: '1px solid var(--line)',
                  color: '#f87171',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 'var(--t-small)',
                  lineHeight: 1.5,
                }}
              >
                {error}
              </div>
            )}

            {isGenerating && (
              <div
                className="mono"
                style={{
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-subtle)',
                  border: '1px solid var(--line)',
                  color: 'var(--ink)',
                  fontSize: 12,
                }}
              >
                {stage || 'Memproses...'}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                className="btn mono"
                onClick={() => setOpen(false)}
                disabled={isGenerating}
                style={{ padding: '8px 14px', fontSize: '13px' }}
              >
                Batal
              </button>
              <button
                type="button"
                className="btn btn-primary mono"
                onClick={handleGenerate}
                disabled={isGenerating}
                style={{ padding: '8px 16px', fontSize: '13px' }}
              >
                {isGenerating ? 'Menyusun...' : 'Terbitkan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
