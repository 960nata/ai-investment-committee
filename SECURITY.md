# Keamanan

Dokumen ini mencatat apa yang dilindungi, bagaimana cara melindunginya, dan apa
yang belum terlindungi. Bagian terakhir sama pentingnya dengan dua yang pertama:
daftar keamanan yang hanya memuat kabar baik tidak bisa dipakai siapa pun untuk
mengambil keputusan.

## Tindakan mendesak: rotasi kredensial

Berkas `.env.local` memuat 84 kredensial aktif. Seluruhnya pernah ditempel ke
percakapan, jadi semuanya harus dianggap bocor dan diganti, bukan dipertahankan
karena tampaknya belum disalahgunakan.

Urutan prioritas, dari yang paling merugikan bila disalahgunakan:

| Urutan | Kredensial | Jumlah | Alasan didahulukan |
| --- | --- | --- | --- |
| 1 | OpenRouter | 24 | Tersambung ke saldo; penyalahgunaan langsung jadi tagihan |
| 2 | `DATABASE_URL`, `DIRECT_URL` | 2 | Akses baca dan tulis penuh ke seluruh data |
| 3 | Gemini | 38 | Kuota besar, mudah dipakai orang lain |
| 4 | Groq | 16 | Sama |
| 5 | DeepSeek, Mistral, NVIDIA | 3 | Kuota lebih kecil |

Langkah rotasi:

1. Cabut kunci lama di konsol tiap penyedia. Mencabut lebih dulu, bukan sesudah
   membuat yang baru: kunci yang masih hidup tetap bisa dipakai selama jeda itu.
2. Terbitkan kunci baru, masukkan ke Vercel Environment Variables, bukan ke repo.
3. Untuk Postgres, ganti kata sandi basis data lalu perbarui kedua URL.
4. Jalankan `git log --all --diff-filter=A --name-only --format="" | grep -i '^\.env'`
   untuk memastikan tidak ada `.env` yang pernah masuk riwayat. Saat dokumen ini
   ditulis, hanya `.env.example` yang pernah di-commit, dan isinya contoh kosong.

Mencabut kunci saja tidak cukup bila berkasnya pernah masuk commit. Riwayat git
menyimpan isi berkas selamanya, dan repo publik dipindai bot dalam hitungan menit.

## Yang sudah dilindungi

### Rahasia

- Seluruh berkas berawalan `.env` diabaikan git, termasuk salinan sementara
  seperti `.env.backup` yang paling sering lolos tanpa disadari.
- Hanya satu variabel berawalan `NEXT_PUBLIC_`, yaitu URL aplikasi. Awalan itu
  membuat nilainya ikut ke bundel peramban, jadi rahasia tidak boleh memakainya.
- Kunci LLM tidak pernah keluar dari server. Endpoint status hanya melaporkan
  jumlah dan sidik SHA-256 terpotong, yang tidak bisa dikembalikan jadi kuncinya.

### Endpoint

| Endpoint | Perlindungan |
| --- | --- |
| `/api/jobs/*` | Tanda tangan QStash diverifikasi; gagal tertutup bila kunci penandatanganan tidak diset |
| `/api/cron/dispatcher` | Rahasia bearer, dibandingkan dalam waktu tetap |
| `/api/v1/ai/status` | Token operasional |
| `/api/v1/*` | Pembatas laju, validasi masukan, galat tidak dirinci |

Pemicu ingest manual tertutup sepenuhnya di produksi. Endpoint yang menarik data
dari sumber luar tidak boleh bisa dipanggil tanpa tanda tangan.

Rahasia yang belum diset membuat endpoint berhenti bekerja, bukan terbuka. Layanan
yang mati akan segera terlihat; layanan yang diam-diam terbuka tidak.

### Kebocoran lewat pesan galat

Pesan galat Postgres memuat nama host, nama basis data, dan potongan kueri. Pesan
galat fetch memuat URL lengkap beserta parameternya. Sebelumnya semua itu dikirim
apa adanya ke pemanggil.

Sekarang rincian penuh hanya masuk log server, dan pemanggil menerima kalimat umum
beserta satu nomor rujukan yang menyambungkan keluhan dengan baris log yang tepat.

### Header

Dipasang terpusat di `proxy.ts`, bukan diulang di tiap route.

| Header | Nilai |
| --- | --- |
| `Content-Security-Policy` | Skrip hanya yang bernonce, plus `strict-dynamic` |
| `Strict-Transport-Security` | Dua tahun, termasuk subdomain, hanya di produksi |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` dan `frame-ancestors` | Penyematan dilarang, dua lapis |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | Kamera, mikrofon, lokasi, pembayaran dimatikan |

Satu pertukaran yang disengaja: `style-src` mengizinkan inline. Antarmuka ini
memakai atribut `style` React di banyak tempat, dan kebijakan gaya yang kaku akan
membuat halaman tampil rusak. Suntikan gaya jauh lebih terbatas akibatnya
daripada suntikan skrip, dan `script-src` tetap kaku.

### Pembatas laju

Tanpa pembatas, satu skrip sederhana bisa menghabiskan sepuluh ribu perintah
Redis harian dalam hitungan menit tanpa menemukan celah apa pun. Penolakan layanan
lewat kuota adalah kerentanan yang paling murah dieksploitasi.

| Kelompok | Kuota |
| --- | --- |
| Pembacaan dashboard | 120 per menit |
| Endpoint operasional | 20 per menit |
| Endpoint yang menarik data luar | 5 per lima menit |

Pembatas gagal terbuka bila Redis mati. Itu pilihan sadar: mematikan seluruh situs
ketika cache-nya mati menimbulkan gangguan lebih besar daripada yang dicegahnya.

### Basis data

Seluruh kueri lewat Drizzle dengan parameter terikat. Tidak ada satu pun tempat
yang menyusun SQL dari masukan pengguna. Perkakas AI juga tidak menerima SQL
bebas; parameternya tertutup dan tervalidasi.

## Yang belum terlindungi

Daftar ini yang perlu dibaca sebelum produk dibuka untuk umum.

- **Belum ada autentikasi pengguna.** Seluruh dashboard dan API terbuka bagi siapa
  pun yang tahu alamatnya. Cukup selama pemakainya satu orang, tidak cukup begitu
  ada pengguna kedua.
- **Pembatas laju berbasis alamat IP.** Melindungi dari penyalahgunaan biasa,
  bukan dari penyerang yang sengaja memutarinya lewat banyak alamat.
- **Belum ada pemindaian rahasia otomatis.** Belum ada kait pre-commit maupun
  pemeriksaan di CI yang menolak kunci yang tidak sengaja ikut ter-commit.
- **Belum ada pembatasan asal permintaan.** Belum ada daftar asal yang diizinkan
  untuk API, karena belum ada pemakai lintas asal.
- **Suntikan prompt.** Lapisan agen saat ini hanya membaca angka dari basis data.
  Begitu berita dan laporan keuangan masuk ke konteks model, teks dari luar akan
  bisa berisi instruksi, dan itu butuh perlakuan tersendiri sebelum dipasang.
- **Belum ada pencatatan jejak audit.** Tidak ada catatan siapa memanggil apa,
  karena belum ada konsep pengguna.

## Melaporkan celah

Kirim surel ke pemilik repo. Jangan buka issue publik untuk celah keamanan sampai
perbaikannya terpasang.
