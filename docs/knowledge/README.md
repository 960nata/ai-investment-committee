# Knowledge base trading

Bahan acuan untuk komite AI, disusun 2026-10-10 dari riset luar. Berkas di sini
**referensi**, bukan kode yang dijalankan: indikatornya sudah ada di
`lib/features/registry.ts`, dan toolkit Python tidak dipakai aplikasi.

Yang sudah diterapkan ke prompt:

- `lib/agents/roles.ts` — regime pasar, satu suara per kategori bukti,
  batas confidence > 70, cara membaca valas dan obligasi.
- `app/api/v1/committee/ask/route.ts` — risiko dulu, futures kripto, binary option.

Yang sengaja **tidak** diambil:

- Format keluaran entry/stop/target (Bagian 10). Platform ini tidak menyebut
  target harga atau perintah transaksi; itu butuh izin Penasihat Investasi.
- Tabel ARA/ARB BEI per 28 Sep 2026 (Bagian 7). Belum diverifikasi ke
  pengumuman resmi BEI; kalau dipakai, jadikan konfigurasi bertanggal.
- Angka praktis (ADX 25, profit factor 1,5, ambang funding) — aturan komunitas,
  perlu diuji di data platform sebelum dipakai sebagai ambang.
