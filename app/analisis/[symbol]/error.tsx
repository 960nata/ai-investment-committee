'use client'

import { SegmentError } from '@/components/segment-error'

export default function AnalisisError(props: { error: Error & { digest?: string }; retry: () => void }) {
  return <SegmentError {...props} backHref="/" backLabel="Ke beranda" />
}
