import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { GuidePage, guideMetadata } from '@/components/guide-page'
import { SOURCE_LOCALE, TRANSLATED_LOCALES, isLocale } from '@/lib/i18n/locales'

interface Props {
  params: Promise<{ lang: string }>
}

/** Empat bahasa selain sumber dirender sekali saat build; isinya statis. */
export function generateStaticParams() {
  return TRANSLATED_LOCALES.map((lang) => ({ lang }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params
  if (!isLocale(lang) || lang === SOURCE_LOCALE) return {}
  return guideMetadata(lang)
}

export default async function LocalizedPanduanPage({ params }: Props) {
  const { lang } = await params
  if (!isLocale(lang) || lang === SOURCE_LOCALE) notFound()
  return <GuidePage locale={lang} />
}
