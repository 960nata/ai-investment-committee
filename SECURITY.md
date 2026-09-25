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
| `/api/v1/committee/deliberate` | Sesi wajib; `force` hanya untuk admin; kuota 3/jam; pagu belanja harian |
| `/api/v1/auth/*` | Kuota 10 per lima menit |
| `/api/v1/analytics/collect` | Kuota 30/menit; perayap dibuang sebelum menulis baris |
| `/api/v1/*` | Penyaring serangan, pembatas laju, validasi masukan, galat tidak dirinci |

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
| Ketukan telemetri kunjungan | 30 per menit |
| Endpoint operasional | 20 per menit |
| Masuk, daftar, dan segala yang menerima kata sandi | 10 per lima menit |
| Endpoint yang menarik data luar | 5 per lima menit |
| Endpoint yang memanggil model | 3 per jam |

Pembatas gagal terbuka bila Redis mati. Itu pilihan sadar: mematikan seluruh situs
ketika cache-nya mati menimbulkan gangguan lebih besar daripada yang dicegahnya.
Pagu belanja model di bawah memilih sebaliknya, dan alasannya ditulis di sana.

### Penyaring serangan

Tiga lapis, disusun dari yang paling murah ke yang paling mahal. Urutannya bukan
selera: pemindai mengirim ribuan permintaan sampah, dan lapisan yang memakai
kuota tidak boleh dipakai untuk menolak sesuatu yang bisa ditolak lapisan yang
gratis. Kalau urutannya dibalik, penolakannya tetap berhasil sementara kuotanya
tetap habis — persis hasil yang sedang dicegah.

| Lapis | Berkas | Biaya | Yang ditangkap |
| --- | --- | --- | --- |
| 1 | `lib/http/blocklist.ts` (memori proses) | nol | Penyerang yang sudah diblokir dan kebetulan kembali ke instance yang sama |
| 2 | `lib/http/shield.ts` | nol | Alamat pemindai, perkakas serangan, muatan suntikan, penelusuran direktori |
| 3 | `lib/http/ratelimit.ts` | satu perintah | Blokir tersimpan dan laju pemanggil, digabung dalam satu pipeline |

Yang dikenali lapis kedua, dan alasan tiap-tiapnya:

- **Alamat pemindai.** Dicocokkan per segmen alamat, bukan sebagai potongan teks
  di mana pun. Perbedaannya penting: `whm` dan `pma` sebagai potongan teks akan
  ikut menolak judul warta yang kebetulan memuatnya, dan artikel yang hilang
  karena tiga huruf di judulnya adalah kerusakan yang sangat sulit ditelusuri
  balik ke penyaringnya. Ada uji regresi khusus untuk ini.
- **Perkakas serangan.** sqlmap, nikto, nuclei, dan kerabatnya menyebut dirinya
  sendiri di header. Tidak ada skenario jujur yang berakhir dengan salah satunya
  menunjuk ke situs ini.
- **Muatan suntikan.** SQL, skrip, templat, dan perintah sistem, dicocokkan ke
  alamat dan string kueri yang sudah didekode dua putaran — penyandian berlapis
  memang dipakai justru untuk melewati pemeriksa yang mendekode sekali.
- **Klien otomatis**, tetapi hanya di jalur yang membelanjakan kuota model.
  Pemblokiran berdasarkan agen peramban punya harga berupa pengguna sah yang
  salah tertangkap, dan harga itu cuma sepadan ketika yang dilindungi benar-benar
  habis kalau salah.

Badan permintaan sengaja tidak diperiksa di sini. Membacanya di proxy akan
menghabiskan aliran yang dibutuhkan route di belakangnya, dan route-nya akan
menerima badan kosong. Pemeriksaan badan tetap urusan route lewat skema zod-nya.

Hukumannya bertingkat: satu jam, enam jam, sehari, lalu sepekan, dengan
penghitung pelanggaran berumur tujuh hari. Pelanggar pertama kali dihukum
singkat karena satu pelanggaran tunggal adalah sinyal yang cukup sering salah;
pengulangan jauh lebih jarang salah, dan itulah yang dihukum lama.

Satu blokir menghasilkan satu baris catatan, bukan satu baris per permintaan.
Klaimnya lewat `SET ... NX`, satu perintah yang sekaligus menjawab "sudah
diblokir?" dan "kalau belum, blokir sekarang". Tanpa itu, satu pemindai bisa
menulis ribuan baris identik dan justru pencatat serangannya yang menghabiskan
kuota. Catatannya dibaca di `/admin/keamanan`.

### Pagu belanja model

Pembatas laju menjawab "seberapa cepat satu pemanggil boleh meminta". Ia tidak
menjawab pertanyaan yang sebenarnya membahayakan proyek ini: "berapa banyak yang
boleh dibelanjakan seluruh dunia hari ini". Seratus alamat yang masing-masing
patuh pada kuota per-alamat tetap bisa menghabiskan seluruh kuota harian kunci
gratisan sebelum tengah hari, dan tiap satu dari mereka tidak pernah melanggar
apa pun.

`lib/http/budget.ts` menghitungnya bersama-sama: satu pagu harian, dengan enam
puluh persennya jatah publik dan sisanya disimpan untuk rapat terjadwal. Jatah
per akun dipotong terpisah, supaya satu orang tidak menghabiskan jatah publik
sendirian. Satuan yang dipesan tetapi tidak jadi dipakai — rapat yang ternyata
dijawab dari hasil yang sudah ada — dikembalikan.

Berbeda dari pembatas laju, pagu ini tidak gagal terbuka. Ketika penghitungnya
tidak terbaca, ia turun ke penghitung di memori proses dengan pagu seperempatnya:
tiap instance memegang salinannya sendiri, jadi pagu sebenarnya terkalikan
sebanyak instance yang hidup, dan seperempat adalah kompensasinya. Pilihan itu
menggantikan dua jawaban yang sama-sama buruk — meloloskan semua berarti tidak
ada perlindungan persis di lapisan yang paling dibutuhkan, menolak semua berarti
fitur yang mati total di pemasangan yang belum menyiapkan Redis.

### Basis data

Seluruh kueri lewat Drizzle dengan parameter terikat. Tidak ada satu pun tempat
yang menyusun SQL dari masukan pengguna. Perkakas AI juga tidak menerima SQL
bebas; parameternya tertutup dan tervalidasi.

## Yang belum terlindungi

Daftar ini yang perlu dibaca sebelum produk dibuka untuk umum.

- **Pembatas laju berbasis alamat IP.** Melindungi dari penyalahgunaan biasa,
  bukan dari penyerang yang sengaja memutarinya lewat banyak alamat. Yang menutup
  celah itu khusus untuk belanja model adalah pagu harian; untuk endpoint lain,
  celahnya masih terbuka.
- **Penyaring serangan berbasis tanda tangan pola.** Ia mengenali serangan yang
  bentuknya sudah dikenal. Serangan yang dirancang khusus untuk situs ini, dengan
  agen peramban yang wajar dan muatan yang tidak menyerupai satu pun pola di
  daftar, akan lewat begitu saja. Daftar pola menaikkan biaya penyerang; ia tidak
  pernah menutup pintu.
- **Blokir per alamat, bukan per pelaku.** Penyerang yang berpindah alamat
  memulai dari nol, termasuk penghitung pelanggarannya.
- **Belum ada pemindaian rahasia otomatis.** Belum ada kait pre-commit maupun
  pemeriksaan di CI yang menolak kunci yang tidak sengaja ikut ter-commit.
- **Belum ada pembatasan asal permintaan.** Belum ada daftar asal yang diizinkan
  untuk API, karena belum ada pemakai lintas asal.
- **Suntikan prompt.** Lapisan agen saat ini hanya membaca angka dari basis data.
  Begitu berita dan laporan keuangan masuk ke konteks model, teks dari luar akan
  bisa berisi instruksi, dan itu butuh perlakuan tersendiri sebelum dipasang.
- **Jejak audit hanya untuk serangan.** Blokir yang dijatuhkan tercatat dan bisa
  dibaca di `/admin/keamanan`, tetapi tidak ada catatan siapa memanggil apa di
  jalur yang normal.

## Melaporkan celah

Kirim surel ke pemilik repo. Jangan buka issue publik untuk celah keamanan sampai
perbaikannya terpasang.
