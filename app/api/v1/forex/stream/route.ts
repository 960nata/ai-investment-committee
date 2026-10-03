import { getForexState } from '@/lib/forex/rates'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: Request) {
  const encoder = new TextEncoder()
  let lastSentTimestamp = 0

  const stream = new ReadableStream({
    async start(controller) {
      // 1. Kirim state awal segera begitu browser terhubung
      try {
        const initial = await getForexState()
        lastSentTimestamp = initial.updatedAt
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(initial)}\n\n`))
      } catch (err) {
        console.warn('[Forex Stream] Gagal kirim state awal:', err)
      }

      // 2. Loop berkala untuk memantau perubahan dari terminal / Redis
      let heartbeatCounter = 0
      const timer = setInterval(async () => {
        try {
          heartbeatCounter++
          const latest = await getForexState()

          if (latest && latest.updatedAt > lastSentTimestamp) {
            lastSentTimestamp = latest.updatedAt
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(latest)}\n\n`))
          } else if (heartbeatCounter % 10 === 0) {
            // Heartbeat setiap 15 detik agar koneksi tetap hidup melewati proksi
            controller.enqueue(encoder.encode(`: ping\n\n`))
          }
        } catch {
          // Abaikan kesalahan sementara
        }
      }, 1500)

      req.signal.addEventListener('abort', () => {
        clearInterval(timer)
        try {
          controller.close()
        } catch {
          // Controller mungkin sudah ditutup
        }
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
