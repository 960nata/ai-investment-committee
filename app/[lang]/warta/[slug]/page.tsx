/**
 * Satu artikel warta dalam bahasa selain Indonesia: /en, /zh, /ja, /ru.
 *
 * Bahasa yang tidak dikenal, atau artikel yang versi bahasanya belum ditulis,
 * berakhir di 404 — bukan diam-diam menampilkan versi Indonesia di alamat
 * berbahasa lain, yang akan membuat mesin pencari mengindeks isi yang salah.
 */

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { WartaArticle, wartaArticleMetadata } from '@/components/warta-article'
import { SOURCE_LOCALE, isLocale } from '@/lib/i18n/locales'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ lang: string; slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, slug } = await params
  if (!isLocale(lang) || lang === SOURCE_LOCALE) return {}
  return wartaArticleMetadata(slug, lang)
}

export default async function LocalizedWartaPage({ params }: Props) {
  const { lang, slug } = await params
  if (!isLocale(lang) || lang === SOURCE_LOCALE) notFound()
  return <WartaArticle slug={slug} locale={lang} />
}
