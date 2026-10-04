'use client'

import { SegmentError } from '@/components/segment-error'

export default function PageError(props: { error: Error & { digest?: string }; retry: () => void }) {
  return <SegmentError {...props} />
}
