# ADDENDUM KB — FUTURES CRYPTO & BINARY OPTION

Tambahan untuk `trading_knowledge_base.md` (Bagian 6 crypto). Versi 2026-10-10.
Cara pakai: hitung angka lewat `derivatives_toolkit.py`, jangan oleh LLM.

---

## A. FUTURES CRYPTO (PERPETUAL & DATED)

### A1. Konsep dasar (wajib dipahami AI)
- **Perpetual (perp)**: kontrak tanpa kedaluwarsa; harganya diikat ke spot lewat **funding rate**. Positif = long membayar short; negatif = short membayar long. Funding jalan walau posisi rugi.
- **Futures bertanggal**: ada tanggal settlement; selisih ke spot = *basis*.
- **Margin**: jaminan. **Leverage** = notional ÷ margin. Leverage tidak mengubah risiko per se; *notional* yang mengubah. Risiko nyata = jarak ke stop × notional.
- **Isolated vs Cross**:
  - Isolated: margin dikunci per posisi, rugi maksimum = margin posisi itu, harga likuidasi relatif tetap. **Default untuk pemula dan untuk AI.**
  - Cross: seluruh saldo jadi jaminan; satu posisi buruk bisa menyapu seluruh akun.
- **Mark price vs last price**: likuidasi biasanya memakai mark price (anti-manipulasi), bukan last price. Wick liar di last price tidak selalu likuidasi, tapi lonjakan mark bisa.
- **Maintenance margin (MMR)**: batas minimal jaminan; turun di bawahnya = **likuidasi**. MMR bertingkat: makin besar posisi, makin tinggi MMR (dihitung marginal per tier). Biaya trading, funding, dan slippage biasanya tidak termasuk di harga likuidasi yang ditampilkan, jadi hasil nyata bisa lebih buruk.
- Mekanisme tambahan tiap bursa: insurance fund, **ADL** (auto-deleveraging), likuidasi parsial. Detail berbeda per bursa → **verifikasi di dokumentasi bursa yang dipakai**.

### A2. Rumus (USDT-margined linear, isolated; pendekatan edukatif)
- Harga likuidasi **long** ≈ entry × (1 − 1/L + MMR)
- Harga likuidasi **short** ≈ entry × (1 + 1/L − MMR)
- Contoh entry 100.000, MMR 0,5%: 10x long → ≈90.500 (−9,5%); 25x → ≈96.500 (−3,5%); 50x → ≈98.500 (−1,5%); 100x → ≈99.500 (−0,5%). Leverage dua kali lipat ≈ jarak ke likuidasi separuh.
- **Notional** = qty × harga. **Leverage efektif** = total notional semua posisi ÷ ekuitas akun (ini yang penting, bukan angka slider leverage).
- **Biaya funding** = notional × funding_rate × jumlah interval. Contoh: 0,01% per 8 jam = ~0,03%/hari ≈ ~11%/tahun dari notional (dan ×leverage dari margin). Funding itu biaya nyata bagi yang menahan lama di sisi padat.
- **Fee**: taker biasanya lebih mahal daripada maker; masukkan fee masuk+keluar (dan slippage) ke perhitungan R:R. Pada scalping, fee bisa memakan seluruh edge.

### A3. Ukuran posisi untuk futures (urutan wajib)
1. Tentukan **stop** berdasarkan struktur/ATR (bukan berdasarkan leverage).
2. Risiko uang = ekuitas × risk% (default 0,5–1%).
3. **Notional = risiko uang ÷ jarak stop (% dari entry)**, sudah termasuk fee+slippage.
4. Margin = notional ÷ leverage. Leverage dipilih *sesudah* itu, sekadar cukup agar margin tersedia.
5. **Cek buffer likuidasi**: harga stop harus jauh di dalam harga likuidasi. Heuristik: jarak stop ≤ ~50% dari jarak entry→likuidasi (supaya stop terpicu sebelum likuidasi, termasuk saat gap/slippage). Jika tidak terpenuhi → kurangi leverage atau notional, bukan melebarkan harapan.
6. Cek leverage efektif akun dan batas eksposur (default pemula ≤ 3x efektif; ini heuristik konservatif, sesuaikan dengan profil pengguna).
7. Jangan menambah margin ke posisi rugi untuk "menghindari likuidasi" (itu averaging down terselubung).

### A4. Strategi & kondisi yang cocok
- Pakai regime dulu (Bagian 4 KB utama). Futures memperbesar kesalahan regime.
- Sinyal derivatif (jangan dipakai sendirian):
  - Harga naik + OI naik = posisi baru long (tren didukung, tapi leverage menumpuk); harga naik + OI turun = kenaikan oleh short covering (lebih rapuh); harga turun + OI naik = short baru masuk; harga turun + OI turun = long likuidasi/menyerah.
  - Funding ekstrem + OI tinggi = pasar padat satu sisi → risiko squeeze/cascade likuidasi; lebih berguna sebagai peringatan kontra-arah daripada sinyal entry.
  - Funding netral ~0,01%/8j; ambang ±0,05%/8j sering dipakai sebagai "ekstrem" (default komunitas; sesuaikan per aset).
- Hindari: leverage tinggi di sekitar rilis data makro, akhir pekan likuiditas tipis, koin kecil dengan order book tipis, menahan posisi besar saat funding mahal tanpa alasan.
- Hedging/delta-neutral (spot long + perp short, atau basis trade) adalah strategi lanjutan; risikonya ada di likuidasi sisi short saat spike, funding berbalik, dan risiko bursa. Jangan disarankan ke pemula.

### A5. Risiko khusus & guardrail
- Likuidasi = kehilangan seluruh margin posisi. Pada cross margin = bisa seluruh akun.
- Gap/slippage: stop bukan jaminan harga terisi.
- Risiko platform: bursa offshore tanpa izin (tanpa perlindungan konsumen), downtime saat volatil, ADL.
- Leverage tinggi (di atas ±10x) hampir selalu menurunkan peluang bertahan bagi trader non-profesional; AI **tidak boleh** mendorong leverage tinggi.
- Guardrail kode: tolak order bila harga likuidasi lebih dekat dari batas buffer; tolak bila leverage efektif > batas; circuit breaker harian; larang cross margin untuk pengguna awam kecuali dikonfigurasi eksplisit.

### A6. Konteks regulasi Indonesia (per sumber berita 2026; verifikasi ke OJK)
- Pengawasan aset kripto sudah di bawah OJK. Ada perdagangan futures kripto di platform lokal berizin: Bittime meluncurkan Futures pada Juli 2026 setelah izin dari PT Central Finansial X (CFX) di bawah pengawasan OJK, 49 pair, leverage hingga 25x, mode cross/isolated, dan **wajib lulus knowledge test** sebelum bisa akses.
- Angka transaksi derivatif aset keuangan digital domestik Juli 2026 ≈ Rp3,41 triliun (turun 18,5% dari Juni), menurut data OJK yang dikutip media. (Artikel ini sebagian bersumber dari data platform; baca sebagai indikasi, bukan data independen.)
- Saran produk: AI sebaiknya merujuk ke platform **berizin** dan mengingatkan bursa offshore tanpa izin tidak memberi perlindungan hukum yang sama. Detail aturan (batas leverage, syarat nasabah, pajak) perlu dicek langsung ke sumber resmi OJK/CFX/PAKD; jangan menebak.

### A7. Checklist pra-trade futures
- [ ] Regime + arah timeframe besar jelas
- [ ] Stop ditentukan dari struktur/ATR; R:R ≥ 1:2 **setelah fee + funding + slippage**
- [ ] Notional dihitung dari risiko, bukan dari leverage
- [ ] Harga likuidasi jauh di luar stop (buffer terpenuhi)
- [ ] Mode isolated; leverage efektif akun ≤ batas
- [ ] Funding/OI tidak ekstrem melawan posisi; tidak ada rilis besar dalam waktu dekat
- [ ] Platform berizin; tahu aturan likuidasi/ADL di bursa tersebut

---

## B. BINARY OPTION — MODUL PERINGATAN (BUKAN MODUL SINYAL)

### B1. Status di Indonesia
- Bappebti bersama Kominfo memblokir ratusan situs trading ilegal pada 2021–2022: 1.222 situs, termasuk sedikitnya 92 domain binary option (mis. Binomo, IQ Option, Olymptrade, Quotex) dan 336 robot trading. Binary option dikategorikan sebagai judi berkedok trading karena hanya menebak arah harga tanpa pembelian aset sebenarnya. (Sumber: pemberitaan Hukumonline/Kontan/Bisnis; berita 2022 — status terkini perlu dicek ke Bappebti/Kemendag/OJK.)
- Akibat praktis: platform tidak berizin = tidak ada pengawasan dan perlindungan hukum yang berarti bagi pengguna. Mempromosikan atau menjadi afiliasi platform ini juga berisiko hukum.

### B2. Kenapa secara matematika hampir selalu merugikan
Binary (fixed-return): menang → untung `p` × taruhan (mis. p = 85%); kalah → hilang 100% taruhan.
- **Break-even win rate** = 1 ÷ (1 + p). Dengan p = 85% → **≈54,1%**; p = 80% → ≈55,6%; p = 90% → ≈52,6%.
- **Expected value per unit taruhan** = W·p − (1−W). Dengan p = 85%: W = 55% → **+1,75%** (tipis); W = 52% → **−3,8%**; W = 50% → **−7,5%**.
- **Kelly** = W − (1−W)/p. Dengan W = 55%, p = 85% → ≈ **2,1%** dari modal. Artinya bahkan dengan edge nyata 55%, ukuran taruhan optimal sangat kecil; bermain besar pasti merusak modal.
- Tidak ada stop-loss; hasil dikunci oleh waktu kedaluwarsa. Win rate yang "terasa" 50–60% di jangka pendek bisa hanya noise; dibutuhkan ratusan hingga ribuan taruhan untuk membedakan edge nyata dari keberuntungan.
- Model bisnis platform: rugi trader = pendapatan platform; platform juga sering mengatur payout, spread, dan harga referensinya sendiri.

### B3. Perilaku yang harus ditegakkan AI
1. **Jangan membuat sinyal atau robot untuk platform binary option ilegal.** Jelaskan matematika di atas, lalu arahkan ke alternatif.
2. Jangan menyebut "strategi martingale/double-up" sebagai solusi; martingale meningkatkan risiko kebangkrutan seiring serangkaian kalah beruntun.
3. Jika pengguna sudah terlanjur main: fokus pada pembatasan kerugian, jangan top-up untuk "balik modal", dan perlakukan sebagai biaya hiburan; jika sulit berhenti, sarankan bantuan profesional.
4. Bila pengguna ingin eksposur jangka pendek berbasis arah harga, alternatif yang risikonya terdefinisi dan diawasi: spot atau futures di platform berizin dengan stop dan ukuran berbasis risiko (Bagian A), bukan produk "tebak naik/turun".

### B4. Catatan opsi sungguhan (bukan binary)
Opsi saham/indeks reguler (call/put) berbeda: payoff tidak biner, ada premium, delta/gamma/theta/vega, dan risiko kedaluwarsa; perlu modul tersendiri (Black-Scholes/Greeks) kalau platform nanti menambah opsi. Belum termasuk di KB ini.

---

## C. PROMPT TAMBAHAN (tempel ke system prompt)

```
Untuk futures crypto: hitung notional dari risiko (bukan dari leverage), wajib cek buffer harga likuidasi terhadap stop, default isolated margin, leverage efektif akun dibatasi. Jangan pernah mendorong leverage tinggi atau menambah margin ke posisi rugi. Fee, funding, dan slippage masuk ke R:R.
Untuk binary option: jangan buat sinyal/robot untuk platform binary option. Jelaskan bahwa di Indonesia platform ini diblokir otoritas dan secara matematis payout tetap membuat break-even win rate >50%. Tawarkan alternatif berizin dengan risiko terdefinisi.
Selalu: bukan nasihat keuangan; verifikasi regulasi ke sumber resmi (OJK/CFX/Bappebti).
```

> Catatan: rumus likuidasi adalah pendekatan umum; tiap bursa memakai tier MMR, mark price, fee, dan aturan ADL sendiri. Gunakan sebagai penyaring awal; angka final harus dicek ke API/dokumentasi bursa.
