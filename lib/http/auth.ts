/**
 * Pemeriksaan rahasia bersama.
 *
 * Dua endpoint dilindungi rahasia: dispatcher cron dan endpoint operasional.
 * Keduanya memakai pembanding waktu-tetap, bukan `===`.
 *
 * Perbandingan string biasa berhenti pada karakter pertama yang berbeda, jadi
 * lama pemeriksaannya membocorkan berapa banyak karakter awal yang sudah benar.
 * Dari situ sebuah rahasia bisa ditebak karakter demi karakter, bukan sekaligus.
 * Selisihnya memang kecil dan berisik lewat internet, tetapi menutupnya hanya
 * butuh sepuluh baris, jadi tidak ada alasan membiarkannya terbuka.
 */

/**
 * Bandingkan dua string dalam waktu yang tidak bergantung isinya.
 *
 * Panjang string tetap bocor lewat waktu, dan itu memang tidak terhindarkan
 * tanpa hashing. Karena itu rahasia yang dipakai harus panjang dan acak,
 * sehingga mengetahui panjangnya tidak menolong siapa pun.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Tetap lakukan pekerjaan sebanding supaya jalur gagal tidak selesai jauh
    // lebih cepat daripada jalur berhasil.
    let sink = 0
    for (let i = 0; i < a.length; i++) sink |= a.charCodeAt(i)
    void sink
    return false
  }

  let difference = 0
  for (let i = 0; i < a.length; i++) {
    difference |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return difference === 0
}

export type SecretCheck =
  | { ok: true }
  | { ok: false; reason: 'not-configured' | 'missing' | 'mismatch' }

/**
 * Cocokkan header `Authorization: Bearer <rahasia>` dengan rahasia yang diharapkan.
 *
 * Rahasia yang belum diset bukan berarti "boleh lewat". Endpoint yang dilindungi
 * harus gagal tertutup: lebih baik berhenti bekerja dan terlihat rusak daripada
 * diam-diam terbuka untuk seluruh internet.
 */
export function checkBearer(request: Request, expected: string | undefined): SecretCheck {
  if (!expected || expected.length < 16) {
    return { ok: false, reason: 'not-configured' }
  }

  const header = request.headers.get('authorization')
  if (!header) return { ok: false, reason: 'missing' }

  const prefix = 'Bearer '
  if (!header.startsWith(prefix)) return { ok: false, reason: 'missing' }

  return timingSafeEqual(header.slice(prefix.length), expected)
    ? { ok: true }
    : { ok: false, reason: 'mismatch' }
}

/**
 * Penjaga endpoint operasional.
 *
 * Halaman dan endpoint yang memperlihatkan keadaan mesin — penyedia mana yang
 * terpasang, berapa kunci tersedia, kunci mana yang sedang kena limit — tidak
 * membocorkan rahasia apa pun, tetapi tetap merupakan peta operasional. Tidak
 * ada alasan memberikannya kepada pengunjung anonim.
 *
 * Di luar produksi penjaga ini dilonggarkan supaya pengembangan tidak terhambat.
 */
export function requireAdmin(request: Request): SecretCheck {
  if (process.env.NODE_ENV !== 'production') return { ok: true }
  return checkBearer(request, process.env.ADMIN_TOKEN)
}

/** Penjaga dispatcher cron. Vercel Cron mengirim rahasianya sebagai bearer. */
export function requireCron(request: Request): SecretCheck {
  if (process.env.NODE_ENV !== 'production') return { ok: true }
  return checkBearer(request, process.env.CRON_SECRET)
}
