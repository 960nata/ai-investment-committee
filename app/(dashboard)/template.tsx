import { PageEnter } from '@/components/motion-kit'

/**
 * Transisi isi dashboard. Bar atas, rel, dan pita pengumuman ada di layout,
 * jadi tetap diam; hanya isi halaman yang muncul bertahap — termasuk saat
 * skeleton `loading.tsx` digantikan isi sebenarnya.
 */
export default function DashboardTemplate({ children }: { children: React.ReactNode }) {
  return <PageEnter>{children}</PageEnter>
}
