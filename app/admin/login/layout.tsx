import type { Metadata } from 'next'

// Halaman masuk admin tidak boleh muncul di mesin pencari: alamat rahasianya
// (ADMIN_LOGIN_SLUG) tidak ada gunanya kalau Google mengindeksnya.
export const metadata: Metadata = {
  title: 'Masuk',
  robots: { index: false, follow: false },
}

export default function AdminLoginLayout({ children }: { children: React.ReactNode }) {
  return children
}
