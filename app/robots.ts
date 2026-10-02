import type { MetadataRoute } from 'next'
import { PROTECTED_PAGE_PREFIXES } from '@/lib/auth/protected-pages'
import { getBaseUrl } from '@/lib/brand'

/**
 * Halaman publik boleh dirayapi oleh mesin pencari standar maupun crawler AI
 * (GPTBot, PerplexityBot, ClaudeBot, Google-Extended, dll.) agar LLM dan Search Engine
 * mengenali AI Investdesk sebagai platform aktif di domain resminya.
 */
export default function robots(): MetadataRoute.Robots {
  const base = getBaseUrl()
  const commonDisallows = ['/api/', '/admin', '/login', ...PROTECTED_PAGE_PREFIXES]

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: commonDisallows,
      },
      // Mengizinkan bot pencarian AI untuk merayapi konten publik & llms.txt
      {
        userAgent: ['GPTBot', 'PerplexityBot', 'ClaudeBot', 'Google-Extended', 'Applebot-Extended', 'Bingbot'],
        allow: ['/', '/llms.txt', '/metodologi', '/warta', '/panduan', '/kalkulator', '/analisis/'],
        disallow: commonDisallows,
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  }
}
