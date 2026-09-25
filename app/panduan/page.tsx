import type { Metadata } from 'next'
import { GuidePage, guideMetadata } from '@/components/guide-page'

export const metadata: Metadata = guideMetadata('id')

export default function PanduanPage() {
  return <GuidePage locale="id" />
}
