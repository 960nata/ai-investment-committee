import { ImageResponse } from 'next/og'
import { SITE_NAME } from '@/lib/brand'

/**
 * Kartu pratinjau bawaan saat tautan situs dibagikan (WhatsApp, X, Telegram).
 * Tanpa ini tautan tampil polos tanpa gambar — dan tautan polos jarang diklik.
 */

export const alt = `${SITE_NAME} — analisis probabilistik saham, kripto, dan emas`
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 72,
          background: 'radial-gradient(ellipse 70% 60% at 100% 0%, rgba(250,134,42,0.28), transparent 70%), #040202',
          color: '#fff',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ fontSize: 30, fontWeight: 700, color: '#fa862a' }}>{SITE_NAME}</div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 68, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2 }}>
            Seberapa besar peluang saham Anda naik?
          </div>
          <div style={{ marginTop: 24, fontSize: 30, color: '#94a3b8' }}>
            Skor tiga horizon, rekam jejak sinyal, dan putusan komite AI — IDX, AS, kripto, emas.
          </div>
        </div>
        <div style={{ fontSize: 22, color: 'rgba(255,255,255,0.45)' }}>Data, bukan anjuran investasi.</div>
      </div>
    ),
    size,
  )
}
