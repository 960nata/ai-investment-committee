import type { Metadata } from 'next'

// Halamannya client component, jadi judul tab dipasang di sini.
export const metadata: Metadata = {
  title: 'Daftar',
  description: 'Buat akun gratis untuk menyimpan watchlist, portofolio, dan alert harga.',
  alternates: { canonical: '/daftar' },
}

export default function DaftarLayout({ children }: { children: React.ReactNode }) {
  return children
}
