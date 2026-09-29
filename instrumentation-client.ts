/**
 * Dijalankan di peramban sebelum aplikasi hidup.
 *
 * Vercel BotID menandai permintaan ke jalur di bawah ini dengan bukti bahwa
 * pengirimnya peramban sungguhan — tanpa centang "saya bukan robot". Server
 * memeriksanya dengan `checkBotId()`. Hanya jalur yang memanggil model tanpa
 * akun yang dilindungi di sini; menambah jalur tanpa pemeriksaan di servernya
 * tidak ada gunanya.
 */
import { initBotId } from 'botid/client/core'

initBotId({
  protect: [{ path: '/api/v1/kalkulator/ask', method: 'POST' }],
})
