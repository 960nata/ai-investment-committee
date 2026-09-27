'use client'

/**
 * Peta Ancaman & Serangan Cyber Interaktif (Leaflet Threat Intelligence Map).
 *
 * Menggambar visualisasi pertahanan siber global:
 * - Node Pertahanan Utama: AI Investdesk Server Node (Jakarta, Indonesia) dengan radar pulse hijau/cyan.
 * - Titik Asal Serangan: Koordinat global sumber serangan dengan penanda berkedip sesuai tingkat bahaya (Kritis, Tinggi, Sedang).
 * - Lintasan Serangan (Trajectory Arcs): Garis busur dari asal serangan menuju target.
 * - Mode Realtime: Animasi transmisi serangan langsung dengan ticker insiden berjalan dan tombol Play/Pause.
 * - Penanda interaktif: Popup lengkap berisi IP bertopeng, negara, kota, jenis muatan serangan, bukti pola, dan durasi blokir WAF.
 */

import { useEffect, useRef, useState } from 'react'
import 'leaflet/dist/leaflet.css'
import type { ThreatAttack, CyberTimeRange } from '@/lib/security/threat-data'
import {
  IconShield,
  IconAlert,
  IconPulse,
  IconRadar,
  IconBolt,
  IconLock,
} from '@/components/icons'

/** Ubin peta ArcGIS World Dark Gray (Bebas API Key & Tanpa Watermark). */
const TILE_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}'
const TILE_REF_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}'
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.esri.com/">Esri</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'

const TARGET_COORDS: [number, number] = [-6.2088, 106.8456] // Jakarta, ID

interface CyberThreatMapProps {
  attacks: ThreatAttack[]
  range: CyberTimeRange
  totalBlocked: number
}

export function CyberThreatMap({ attacks, range, totalBlocked }: CyberThreatMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [activeFilter, setActiveFilter] = useState<'all' | 'critical' | 'high' | 'medium'>('all')
  const [isLiveActive, setIsLiveActive] = useState<boolean>(true)
  const [recentLiveIncident, setRecentLiveIncident] = useState<ThreatAttack | null>(
    attacks[0] || null,
  )

  const isRealtime = range === 'realtime'

  // Filter serangan sesuai pilihan tombol
  const filteredAttacks = attacks.filter((att) => {
    if (activeFilter === 'all') return true
    return att.severity === activeFilter
  })

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let disposed = false
    let teardown: (() => void) | null = null
    let animationInterval: NodeJS.Timeout | null = null

    ;(async () => {
      try {
        const L = await import('leaflet')
        if (disposed) return

        // 1. Inisialisasi Peta Leaflet
        const map = L.map(container, {
          center: [15, 40],
          zoom: 2.3,
          minZoom: 2,
          maxZoom: 9,
          scrollWheelZoom: false,
          attributionControl: true,
          worldCopyJump: true,
        })

        L.tileLayer(TILE_URL, {
          attribution: TILE_ATTRIBUTION,
          maxZoom: 9,
        }).addTo(map)

        L.tileLayer(TILE_REF_URL, {
          maxZoom: 9,
          opacity: 0.8,
        }).addTo(map)

        // 2. Buat Lapisan Marker & Garis Lintasan
        const layerGroup = L.layerGroup().addTo(map)

        // Target Server Marker (Jakarta)
        const targetIcon = L.divIcon({
          className: 'target-node-marker',
          html: `
            <div class="target-node-pulse">
              <span class="target-node-ring"></span>
              <span class="target-node-ring outer"></span>
              <span class="target-node-core"></span>
            </div>
          `,
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        })

        const targetMarker = L.marker(TARGET_COORDS, { icon: targetIcon }).addTo(layerGroup)
        targetMarker.bindPopup(`
          <div style="font-family: var(--mono); min-width: 190px;">
            <div style="display:flex; align-items:center; gap:6px; color: #10b981; font-weight:700; margin-bottom:4px;">
              <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#10b981;"></span>
              KOMITE CORE DEFENSE NODE
            </div>
            <div style="font-size:11px; color:#cbd5e1; line-height:1.4;">
              <strong>Lokasi:</strong> Jakarta, Indonesia (Edge Proksi)<br/>
              <strong>Status:</strong> <span style="color:#10b981;">WAF Shield Aktif</span><br/>
              <strong>Mitigasi:</strong> 100% Permintaan Jahat Tertangkal
            </div>
          </div>
        `)

        // 3. Tambahkan Titik Asal Serangan & Busur Lintasan
        const points = filteredAttacks.slice(0, 35)

        points.forEach((att, idx) => {
          const originCoords: [number, number] = [att.origin.lat, att.origin.lng]

          // Warna sesuai tingkat bahaya
          let color = '#ef4444' // critical
          if (att.severity === 'high') color = '#f97316'
          if (att.severity === 'medium') color = '#eab308'

          // Marker Asal
          const originIcon = L.divIcon({
            className: 'threat-origin-marker',
            html: `
              <div class="origin-ping-wrap" style="--threat-color: ${color}">
                <span class="origin-ping-ring"></span>
                <span class="origin-ping-dot" style="background:${color}"></span>
              </div>
            `,
            iconSize: [22, 22],
            iconAnchor: [11, 11],
          })

          const marker = L.marker(originCoords, { icon: originIcon }).addTo(layerGroup)

          marker.bindPopup(`
            <div style="font-family: var(--mono); min-width: 220px; font-size:11px; line-height:1.45;">
              <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:4px; padding-bottom:4px; border-bottom:1px solid rgba(255,255,255,0.1);">
                <strong style="color:${color}; font-size:12px;">${att.origin.flag} ${escapeHtml(att.origin.city)}, ${escapeHtml(att.origin.country)}</strong>
                <span style="font-size:10px; padding:1px 5px; border-radius:3px; background:${color}22; color:${color}; border:1px solid ${color}44;">
                  ${att.severity.toUpperCase()}
                </span>
              </div>
              <div style="color:#e2e8f0; margin-bottom:6px;">
                <strong>Jenis:</strong> ${escapeHtml(att.threatLabel)}<br/>
                <strong>Asal IP:</strong> <code style="color:#38bdf8;">${escapeHtml(att.origin.ipMasked)}</code><br/>
                <strong>Jalur Sasaran:</strong> <code style="color:#fcd34d;">${escapeHtml(att.targetPath)}</code><br/>
                <strong>Metode:</strong> <span style="font-weight:600;">${att.method}</span> &middot; Pelanggaran ke-${att.strike}
              </div>
              <div style="background:rgba(0,0,0,0.3); padding:4px 6px; border-radius:4px; font-size:10px; color:#94a3b8; border-left:2px solid ${color};">
                <strong>Hukuman WAF:</strong> Blokir ${att.banSeconds >= 86400 ? '24 Jam' : '1 Jam'} &middot; Drop Paket
              </div>
            </div>
          `)

          // Garis lintasan busur (Curved Arc)
          const arcPoints = generateCurvedArc(originCoords, TARGET_COORDS, 0.22)
          L.polyline(arcPoints, {
            color,
            weight: 1.4,
            opacity: 0.45,
            dashArray: '3, 6',
          }).addTo(layerGroup)
        })

        // 4. Efek Animasi Pulsa Realtime jika Mode Realtime Aktif
        if (isRealtime && points.length > 0) {
          let stepIndex = 0
          animationInterval = setInterval(() => {
            if (!isLiveActive || disposed) return
            const randomAttack = points[stepIndex % points.length]
            stepIndex++
            setRecentLiveIncident(randomAttack)

            // Buat kilatan paket yang meluncur
            const flashColor = randomAttack.severity === 'critical' ? '#ef4444' : '#f97316'
            const pulseCircle = L.circleMarker([randomAttack.origin.lat, randomAttack.origin.lng], {
              radius: 12,
              color: flashColor,
              fillColor: flashColor,
              fillOpacity: 0.65,
              weight: 2,
            }).addTo(layerGroup)

            setTimeout(() => {
              if (!disposed && map.hasLayer(pulseCircle)) {
                layerGroup.removeLayer(pulseCircle)
              }
            }, 1200)
          }, 2400)
        }

        // Peta responsive
        const resize = new ResizeObserver(() => map.invalidateSize())
        resize.observe(container)

        teardown = () => {
          if (animationInterval) clearInterval(animationInterval)
          resize.disconnect()
          map.remove()
        }

        setStatus('ready')
      } catch {
        if (!disposed) setStatus('failed')
      }
    })()

    return () => {
      disposed = true
      teardown?.()
    }
  }, [filteredAttacks, isRealtime, isLiveActive])

  return (
    <div className="cyber-threat-map-container" suppressHydrationWarning>
      {/* 1. Bar Kendali Atas Peta */}
      <div className="cyber-map-controls mono">
        <div className="cyber-map-status">
          <span className="cyber-pulse-badge">
            <span className="cyber-live-dot" />
            <span>{isRealtime ? 'RADAR REALTIME STREAM' : 'TELEMETRI INTELIJEN'}</span>
          </span>
          <span className="cyber-count-label">
            <strong>{filteredAttacks.length}</strong> titik vektor dipetakan dari{' '}
            <strong>{totalBlocked.toLocaleString('id-ID')}</strong> serangan
          </span>
        </div>

        <div className="cyber-map-filters">
          <button
            type="button"
            className={`cyber-filter-btn ${activeFilter === 'all' ? 'active' : ''}`}
            onClick={() => setActiveFilter('all')}
          >
            Semua ({attacks.length})
          </button>
          <button
            type="button"
            className={`cyber-filter-btn crit ${activeFilter === 'critical' ? 'active' : ''}`}
            onClick={() => setActiveFilter('critical')}
          >
            <span className="dot red" /> Kritis
          </button>
          <button
            type="button"
            className={`cyber-filter-btn high ${activeFilter === 'high' ? 'active' : ''}`}
            onClick={() => setActiveFilter('high')}
          >
            <span className="dot orange" /> Tinggi
          </button>
          <button
            type="button"
            className={`cyber-filter-btn med ${activeFilter === 'medium' ? 'active' : ''}`}
            onClick={() => setActiveFilter('medium')}
          >
            <span className="dot yellow" /> Sedang
          </button>

          {isRealtime && (
            <button
              type="button"
              className={`cyber-stream-toggle ${isLiveActive ? 'playing' : 'paused'}`}
              onClick={() => setIsLiveActive(!isLiveActive)}
              title={isLiveActive ? 'Jeda aliran pulsa' : 'Lanjutkan aliran'}
            >
              {isLiveActive ? '⏸ Jeda' : '▶ Lanjut'}
            </button>
          )}
        </div>
      </div>

      {/* 2. Live Incident Ticker (Hanya tampil di Realtime atau saat ada insiden) */}
      {recentLiveIncident && (
        <div className="cyber-live-ticker mono" suppressHydrationWarning>
          <div className="ticker-badge">
            <IconBolt size={12} />
            <span>INTERSEPSI TERAKHIR</span>
          </div>
          <div className="ticker-content">
            <span className="ticker-flag">{recentLiveIncident.origin.flag}</span>
            <span className="ticker-origin">
              {recentLiveIncident.origin.city} ({recentLiveIncident.origin.ipMasked})
            </span>
            <span className="ticker-arrow">&rarr;</span>
            <span className="ticker-type" style={{ color: getSeverityColor(recentLiveIncident.severity) }}>
              {recentLiveIncident.threatLabel}
            </span>
            <span className="ticker-target">{recentLiveIncident.targetPath}</span>
            <span className="ticker-action">
              [403 BLOCKED &middot; {recentLiveIncident.banSeconds >= 86400 ? '24h' : '1h'}]
            </span>
          </div>
        </div>
      )}

      {/* 3. Kanvas Peta Leaflet */}
      <div className="cyber-map-wrapper">
        <div ref={containerRef} className="cyber-leaflet-canvas" role="img" aria-label="Peta Radar Serangan Cyber" />

        {status !== 'ready' && (
          <div className="cyber-map-overlay mono">
            {status === 'loading' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <IconRadar size={16} className="spinning" />
                <span>Memuat Radar Serangan Cyber Global…</span>
              </div>
            ) : (
              <span>Gagal memuat peta. Periksa koneksi CDN peta.</span>
            )}
          </div>
        )}

        {/* Legend Peta */}
        <div className="cyber-map-legend mono">
          <div className="legend-item">
            <span className="legend-icon node-icon" />
            <span>Target: AI Investdesk Server (ID)</span>
          </div>
          <div className="legend-item">
            <span className="legend-icon crit-icon" />
            <span>Kritis (SQLi / Exploit / DDoS)</span>
          </div>
          <div className="legend-item">
            <span className="legend-icon high-icon" />
            <span>Tinggi (Traversal / Brute Force)</span>
          </div>
          <div className="legend-item">
            <span className="legend-icon med-icon" />
            <span>Sedang (Scanner Probe / Rate Limit)</span>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Hasilkan titik-titik interpolasi busur lengkung (arc) antara dua koordinat */
function generateCurvedArc(
  start: [number, number],
  end: [number, number],
  curvature = 0.2,
): [number, number][] {
  const points: [number, number][] = []
  const steps = 18

  const [lat1, lng1] = start
  const [lat2, lng2] = end

  // Hitung titik tengah dengan simpangan tegak lurus
  const midLat = (lat1 + lat2) / 2
  const midLng = (lng1 + lng2) / 2

  const dLat = lat2 - lat1
  const dLng = lng2 - lng1

  // Simpangan kurva
  const offsetLat = -dLng * curvature
  const offsetLng = dLat * curvature

  const controlLat = midLat + offsetLat
  const controlLng = midLng + offsetLng

  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    // Kurva Bezier Kuadratik: (1-t)^2 * P0 + 2(1-t)t * P1 + t^2 * P2
    const lat = (1 - t) * (1 - t) * lat1 + 2 * (1 - t) * t * controlLat + t * t * lat2
    const lng = (1 - t) * (1 - t) * lng1 + 2 * (1 - t) * t * controlLng + t * t * lng2
    points.push([lat, lng])
  }

  return points
}

function getSeverityColor(sev: string): string {
  if (sev === 'critical') return '#ef4444'
  if (sev === 'high') return '#f97316'
  return '#eab308'
}

function escapeHtml(val: string): string {
  return val
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
