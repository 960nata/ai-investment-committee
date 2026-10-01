import type { MetadataRoute } from 'next'
import { PROTECTED_PAGE_PREFIXES } from '@/lib/auth/protected-pages'

/**
 * Halaman publik boleh dirayapi; API, portal admin, dan terminal yang butuh
 * akun tidak — perayap hanya akan dipantulkan ke halaman masuk.
 */
export default function robots(): MetadataRoute.Robots {
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '')
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/admin', '/login', ...PROTECTED_PAGE_PREFIXES],
    },
    sitemap: `${base}/sitemap.xml`,
    host: base,
  }
}
