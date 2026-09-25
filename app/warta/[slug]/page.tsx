/**
 * Satu artikel warta, versi Indonesia (bahasa sumber).
 *
 * Tampilannya ada di components/warta-article.tsx, dipakai bersama versi
 * bahasa lain di /[lang]/warta/[slug].
 */

import type { Metadata } from 'next'
import { WartaArticle, wartaArticleMetadata } from '@/components/warta-article'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  return wartaArticleMetadata(slug, 'id')
}

export default async function WartaPublikDetailPage({ params }: Props) {
  const { slug } = await params
  return <WartaArticle slug={slug} locale="id" />
}
