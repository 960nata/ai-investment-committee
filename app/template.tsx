import { PageEnter } from '@/components/motion-kit'

/**
 * Transisi antarhalaman untuk seluruh situs: halaman baru memudar masuk.
 * Hanya memudar, tidak menggeser — template ini membungkus header lengket dan
 * menu mobile, dan pergeseran pada pembungkusnya mengganggu elemen `fixed`.
 * Isi dashboard punya transisinya sendiri di app/(dashboard)/template.tsx.
 */
export default function RootTemplate({ children }: { children: React.ReactNode }) {
  return <PageEnter variant="fade">{children}</PageEnter>
}
