import type { Metadata } from 'next'

// Halamannya client component, jadi judul tab dipasang di sini.
export const metadata: Metadata = {
  title: 'Masuk',
  description: 'Masuk ke akun untuk membuka watchlist, portofolio, alert, dan Tanya Komite.',
  alternates: { canonical: '/login' },
}

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children
}
