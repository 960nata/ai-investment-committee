'use client'

/**
 * Peta sebaran pengunjung.
 *
 * Leaflet menyentuh `window` dan `document` sejak baris pertama modulnya, jadi
 * ia tidak boleh ikut dibundel ke render server. Karena itu pustakanya diambil
 * dengan `import()` di dalam effect — bukan di kepala berkas — dan komponen ini
 * menggambar bingkai kosong lebih dulu, baru mengisinya setelah peramban hidup.
 *
 * Penanda berupa lingkaran berukuran akar dari jumlah kunjungan, bukan
 * sebanding lurus. Kota dengan seribu kunjungan memang sepuluh kali lebih ramai
 * daripada kota dengan seratus, tetapi lingkaran sepuluh kali lebih lebar punya
 * luas seratus kali lipat — dan yang dibaca mata adalah luasnya. Akar kuadrat
 * membuat luas lingkaran sebanding dengan angkanya.
 */

import { useEffect, useRef, useState } from 'react'
import 'leaflet/dist/leaflet.css'
import type { VisitPoint } from '@/lib/db/visit-queries'

/**
 * Warna penanda ditulis sebagai nilai harfiah, bukan `var(--signal)`.
 *
 * Leaflet memasang warna lingkaran sebagai atribut `stroke` dan `fill` pada
 * elemen SVG, bukan sebagai properti gaya — dan variabel CSS tidak pernah
 * diurai di dalam atribut presentasi. Ditulis sebagai variabel, lingkarannya
 * bukan gagal berwarna melainkan jadi hitam bawaan.
 */
const MARKER_COLOR = '#e0a13c'

/** Ubin peta ArcGIS World Dark Gray (Bebas API Key & Tanpa Watermark). */
const TILE_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}'
const TILE_REF_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}'
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.esri.com/">Esri</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'

/** Titik yang dikunjungi dalam rentang ini diberi denyut: kota yang sedang aktif. */
const LIVE_WINDOW_MS = 30 * 60 * 1000

export function VisitorMap({
  points,
  notice,
}: {
  points: VisitPoint[]
  /** Pesan yang ditampilkan di atas peta — peta tetap digambar di bawahnya. */
  notice?: string | null
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading')

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let disposed = false
    // Disimpan sebagai fungsi pembersih supaya effect ini tidak perlu tahu tipe
    // Leaflet apa pun di luar blok async di bawah.
    let teardown: (() => void) | null = null

    ;(async () => {
      try {
        const L = await import('leaflet')
        if (disposed) return

        const map = L.map(container, {
          center: [-2.5, 118],
          zoom: 4,
          minZoom: 2,
          maxZoom: 14,
          zoomControl: false,
          // Gulir halaman tidak boleh tersangkut di peta. Zoom lewat roda baru
          // hidup setelah peta diklik, dan mati lagi begitu kursor keluar.
          scrollWheelZoom: false,
          attributionControl: true,
          worldCopyJump: true,
        })
        L.control.zoom({ position: 'topright' }).addTo(map)
        map.on('click', () => map.scrollWheelZoom.enable())
        map.on('mouseout', () => map.scrollWheelZoom.disable())

        L.tileLayer(TILE_URL, {
          attribution: TILE_ATTRIBUTION,
          maxZoom: 14,
        }).addTo(map)

        L.tileLayer(TILE_REF_URL, {
          maxZoom: 14,
          opacity: 0.8,
        }).addTo(map)

        if (points.length > 0) {
          const busiest = Math.max(...points.map((p) => p.visits))
          const now = Date.now()

          // Yang terbesar digambar lebih dulu supaya kota kecil di dekatnya
          // tetap bisa diklik di atasnya.
          const ordered = [...points].sort((a, b) => b.visits - a.visits)

          for (const point of ordered) {
            const share = Math.sqrt(point.visits / busiest)
            const radius = 6 + share * 22
            const where = [point.city, point.region, point.country].filter(Boolean).join(', ')
            const lastSeen = new Date(point.lastSeen)
            const live = now - lastSeen.getTime() < LIVE_WINDOW_MS

            // Lingkaran luar yang pudar memberi kesan cahaya; titik inti yang
            // padat menandai letak kotanya dengan tepat di zoom berapa pun.
            L.circleMarker([point.latitude, point.longitude], {
              radius: radius + 6,
              stroke: false,
              fillColor: MARKER_COLOR,
              fillOpacity: 0.08,
              interactive: false,
            }).addTo(map)

            const marker = L.circleMarker([point.latitude, point.longitude], {
              radius,
              color: MARKER_COLOR,
              fillColor: MARKER_COLOR,
              fillOpacity: 0.3,
              weight: 1.5,
              opacity: 0.9,
            }).addTo(map)

            L.circleMarker([point.latitude, point.longitude], {
              radius: 2.5,
              stroke: false,
              fillColor: '#ffd48a',
              fillOpacity: 1,
              interactive: false,
            }).addTo(map)

            if (live) {
              L.marker([point.latitude, point.longitude], {
                icon: L.divIcon({ className: 'vm-pulse', iconSize: [18, 18] }),
                interactive: false,
                keyboard: false,
              }).addTo(map)
            }

            marker.bindTooltip(
              `${escapeHtml(point.city)} · ${point.visits.toLocaleString('id-ID')}`,
              { direction: 'top', offset: [0, -radius], className: 'vm-tooltip' },
            )

            marker.bindPopup(
              `<div class="vm-popup">` +
                `<strong>${escapeHtml(where)}</strong>` +
                `<div class="vm-popup-grid">` +
                `<span>Kunjungan</span><b>${point.visits.toLocaleString('id-ID')}</b>` +
                `<span>Pengunjung</span><b>${point.visitors.toLocaleString('id-ID')}</b>` +
                `<span>Terakhir</span><b>${escapeHtml(
                  lastSeen.toLocaleString('id-ID', {
                    timeZone: 'Asia/Jakarta',
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  }),
                )}</b>` +
                `</div>` +
                (live ? `<span class="vm-popup-live">● aktif 30 menit terakhir</span>` : '') +
                `</div>`,
            )
          }

          // Peta dibingkai ke titik yang benar-benar ada, bukan ke Indonesia
          // secara membuta: situs yang pembacanya di Eropa tidak seharusnya
          // membuka peta pada laut Jawa.
          const bounds = L.latLngBounds(points.map((p) => [p.latitude, p.longitude]))
          map.fitBounds(bounds, { padding: [60, 60], maxZoom: 7 })
        }

        // Peta yang dibuat selagi bekasnya masih nol piksel — misalnya di dalam
        // panel yang baru dibuka — menggambar ubin di tempat yang salah sampai
        // ada yang mengubah ukuran jendela.
        const resize = new ResizeObserver(() => map.invalidateSize())
        resize.observe(container)

        teardown = () => {
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
  }, [points])

  return (
    <div className="visitor-map-frame">
      <div ref={containerRef} className="visitor-map" role="img" aria-label="Peta sebaran pengunjung" />

      {status !== 'ready' && (
        <div className="visitor-map-overlay mono">
          {status === 'loading' ? 'Memuat peta…' : 'Peta gagal dimuat.'}
        </div>
      )}

      {status === 'ready' && notice && <div className="visitor-map-notice mono">{notice}</div>}
    </div>
  )
}

/**
 * Nama kota masuk ke popup sebagai HTML mentah lewat `bindPopup`, dan nama itu
 * berasal dari header permintaan — artinya dari luar. Dilolos-kan apa adanya,
 * satu nama kota karangan sudah cukup untuk menjalankan skrip di layar admin.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
