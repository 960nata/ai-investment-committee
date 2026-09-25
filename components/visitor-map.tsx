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

/** Ubin peta. Harus ikut diizinkan `img-src` di proxy.ts, atau ubinnya diblokir. */
const TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'

export function VisitorMap({ points }: { points: VisitPoint[] }) {
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
          maxZoom: 12,
          scrollWheelZoom: false,
          attributionControl: true,
          worldCopyJump: true,
        })

        L.tileLayer(TILE_URL, {
          attribution: TILE_ATTRIBUTION,
          subdomains: 'abcd',
          maxZoom: 12,
        }).addTo(map)

        if (points.length > 0) {
          const busiest = Math.max(...points.map((p) => p.visits))

          for (const point of points) {
            const share = Math.sqrt(point.visits / busiest)
            const radius = 6 + share * 22

            const marker = L.circleMarker([point.latitude, point.longitude], {
              radius,
              color: MARKER_COLOR,
              fillColor: MARKER_COLOR,
              fillOpacity: 0.32,
              weight: 1.5,
              opacity: 0.85,
            }).addTo(map)

            const where = [point.city, point.region, point.country]
              .filter(Boolean)
              .join(', ')

            marker.bindPopup(
              `<strong>${escapeHtml(where)}</strong><br>` +
                `${point.visits.toLocaleString('id-ID')} kunjungan · ` +
                `${point.visitors.toLocaleString('id-ID')} pengunjung`,
            )
          }

          // Peta dibingkai ke titik yang benar-benar ada, bukan ke Indonesia
          // secara membuta: situs yang pembacanya di Eropa tidak seharusnya
          // membuka peta pada laut Jawa.
          const bounds = L.latLngBounds(points.map((p) => [p.latitude, p.longitude]))
          map.fitBounds(bounds, { padding: [40, 40], maxZoom: 8 })
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
