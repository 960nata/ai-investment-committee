import type { LlmFailover } from '@/lib/ai/types'

const WIB: Intl.DateTimeFormatOptions = {
  timeZone: 'Asia/Jakarta',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
}

export function formatWib(iso: string | Date): string {
  return new Date(iso).toLocaleString('id-ID', WIB)
}

/** "gemini#0 rate_limited → groq#1 server → cerebras" */
export function failoverChain(failovers: LlmFailover[], answeredBy: string): string {
  return [...failovers.map((f) => `${f.providerId}${f.keyIndex >= 0 ? `#${f.keyIndex}` : ''} ${f.kind}`), answeredBy].join(' → ')
}
