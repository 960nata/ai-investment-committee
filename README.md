# ai-investment-committee

Mesin analisis probabilistik untuk saham IDX, saham AS, dan crypto.

Keluarannya berbentuk peluang, bukan ramalan harga: "peluang naik 61% dalam 1–3
bulan, confidence sedang" — lengkap dengan data mentah yang bisa diperiksa dan
rekam jejak seberapa sering sinyal serupa ternyata benar.

## Yang bukan

Sebelum apa pun yang lain, tiga hal yang sistem ini tidak lakukan:

- **Tidak meramal harga.** Harga saham mengandung komponen acak yang besar.
  Sistem yang menjanjikan "besok 5.400" bukan sistem yang lebih pintar, hanya
  sistem yang menyembunyikan ketidakpastiannya.
- **Tidak memberi rekomendasi.** Kata "beli", "jual", dan "rekomendasi" tidak
  dipakai. Di Indonesia, memberi rekomendasi investasi sebagai kegiatan usaha
  memerlukan izin Penasihat Investasi dari OJK. Posisi proyek ini adalah alat
  analisis data, dan itu tercermin di desainnya, bukan sekadar di disclaimer.
- **Tidak cocok untuk perdagangan harian.** Semua sumber data gratis punya jeda,
  dari lima belas menit sampai empat jam.

## Peran model bahasa

Garis pemisahnya tegas dan tidak bisa ditawar.

| Pekerjaan | Dikerjakan oleh |
| --- | --- |
| Indikator, rasio, skor | Kode deterministik |
| Ekstraksi data dari teks | Model bahasa, keluaran terstruktur |
| Klasifikasi sentimen | Model bahasa |
| Penjelasan untuk pembaca | Model bahasa |
| Angka apa pun yang masuk ke skor | Tidak pernah model bahasa |

Model bahasa membaca dan menjelaskan. Matematika dikerjakan kode, karena hanya
kode yang bisa dihitung ulang persis sama bertahun-tahun kemudian, dan tanpa itu
tidak ada backtest yang berarti.

## Arsitektur

```
Sumber data  ->  Adaptor  ->  Postgres (candle_daily)
                                  |
                                  v
                            Engine fitur  ->  feature_daily
                                  |
                                  v
                            Engine skor   ->  score_daily
                                  |
                                  v
                            Next.js API   ->  Dashboard
```

Berjalan di Vercel. Kendala terbesarnya bukan CPU melainkan batas durasi
function, jadi seluruh pipeline dirancang sebagai potongan kecil yang idempoten:
satu cron per jam membaca tabel jadwal, memecah pekerjaan jadi batch, lalu
menyerahkannya ke QStash yang memanggil worker satu per satu.

| Lapisan | Pilihan |
| --- | --- |
| Web dan API | Next.js 16, App Router |
| Basis data | Postgres, Drizzle ORM |
| Cache | Upstash Redis |
| Antrian | Upstash QStash |
| Penjadwal | Vercel Cron, satu saja |
| Grafik | Lightweight Charts |

## Menjalankan secara lokal

```bash
npm install
cp .env.example .env    # isi DATABASE_URL dan DIRECT_URL
npm run db:setup        # cek sambungan, buat tabel, isi jadwal awal
npm run dev
```

`db:setup` menjalankan empat langkah berurutan dan menampilkan hasil tiap
langkah: memeriksa kedua URL, membuat tabel yang belum ada, menyelaraskan
jurnal migrasi, lalu mengisi jadwal job dan daftar instrumen.

Setelah itu isi riwayat pertamanya tanpa menunggu cron:

```bash
npm run job ingest-crypto-daily
npm run job compute-features-crypto
```

### Kalau Binance diblokir jaringanmu

`api.binance.com` tidak bisa dibuka dari sebagian besar ISP Indonesia. Adaptornya
otomatis pindah ke `data-api.binance.vision`, endpoint data pasar publik resmi
Binance dengan bentuk API yang sama persis, hanya baca dan tanpa kunci. Tidak ada
yang perlu diatur; host yang berhasil dicatat di log dan diingat selama proses
berjalan.

Yang benar-benar wajib hanya `DATABASE_URL`. Tanpa Redis aplikasi tetap jalan
tanpa cache; tanpa QStash, dispatcher memanggil worker langsung, yang cukup untuk
mesin sendiri tetapi tidak untuk produksi karena tidak ada retry di jalur itu.

| Perintah | Kegunaan |
| --- | --- |
| `npm run dev` | Server pengembangan |
| `npm test` | Uji engine fitur |
| `npm run typecheck` | Periksa tipe |
| `npm run db:setup` | Siapkan basis data dari nol, satu perintah |
| `npm run db:check` | Uji kedua URL dan daftar tabel yang sudah ada |
| `npm run db:generate` | Buat migrasi dari perubahan skema |
| `npm run db:migrate` | Terapkan migrasi |
| `npm run db:seed` | Isi jadwal job dan instrumen awal |
| `npm run job <nama>` | Jalankan satu job tanpa HTTP, untuk mengisi riwayat |

## Job terjadwal

Penjadwalan hidup di tabel `job_schedule`, bukan di `vercel.json`. Tier Hobby
hanya mengizinkan sedikit cron, sementara tiga pasar punya ritme berbeda: IDX
tutup sore WIB, bursa AS buka malam WIB, crypto tidak pernah tidur.

| Job | Jadwal | Status |
| --- | --- | --- |
| `ingest-crypto-daily` | tiap jam | aktif |
| `compute-features-crypto` | 01.00 UTC | aktif |
| `ingest-idx-daily` | 17.00 WIB, hari bursa | menunggu adaptor IDX |
| `compute-features-idx` | 18.00 WIB, hari bursa | menunggu adaptor IDX |
| `ingest-us-daily` | 05.00 WIB, hari bursa | menunggu adaptor Finnhub |

## Aturan yang tidak bisa ditawar

Empat hal yang dipegang seluruh basis kode, karena melanggarnya membuat seluruh
angka yang dihasilkan sistem ini tidak berarti.

1. **Fakta mentah dan hasil turunan dipisah total.** Tabel candle tidak pernah
   ditimpa oleh proses perhitungan. Isi `feature_daily` selalu boleh dibuang dan
   dihitung ulang dari nol.
2. **Tidak ada look-ahead.** Nilai fitur hari tertentu hanya boleh dihitung dari
   data sampai hari itu. Sifat ini diuji langsung: `npm test` menghitung seluruh
   set fitur dua kali, atas deret penuh dan atas potongannya, lalu memastikan
   tidak ada satu angka pun yang berubah.
3. **Versi ikut di setiap baris turunan.** Begitu formula berubah,
   `feature_set_version` naik, dan baris lama tetap mencerminkan formula lamanya.
4. **Data basi diberi label.** Pengguna yang tidak tahu datanya mati akan
   mengambil keputusan berdasarkan angka mati. Itu kegagalan produk, bukan
   sekadar kegagalan teknis.

## Status

| Fase | Isi | Status |
| --- | --- | --- |
| 0 | Fondasi: adaptor, dispatcher, worker, skema | selesai |
| 1 | Fitur teknikal, engine skor, backtest | fitur selesai, skor berikutnya |
| 2 | Masuk IDX: XBRL, KSEI, backfill | belum |
| 3 | Lapisan penjelasan dan sentimen | belum |
| 4 | Produk: auth, watchlist, track record | belum |

Urutannya tidak boleh dibalik. Lapisan penjelasan yang dipasang di atas skor yang
belum terbukti hanya menghasilkan omong kosong yang terdengar meyakinkan, dan itu
lebih berbahaya daripada tidak ada penjelasan sama sekali.

## Batasan yang diakui terbuka

- Lemah untuk instrumen tidak likuid; sinyal statistik butuh volume.
- Lemah untuk emiten yang baru tercatat; riwayatnya terlalu pendek untuk
  normalisasi persentil.
- Tidak bisa memprediksi kejutan. Bencana, skandal, dan perubahan regulasi
  mendadak tidak ada di data historis.
- Tidak tahu situasi keuangan penggunanya, jadi tidak bisa menilai apakah sesuatu
  cocok untuk siapa pun.

## Lisensi

Belum ditentukan.
