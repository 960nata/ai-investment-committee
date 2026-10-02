# PRD — Iron Crown: Age of Feudal Realms

**Status:** Draft v1  
**Jenis:** Game design / product requirements  
**Genre:** Real-time strategy (RTS), historical-inspired  
**Target awal:** PC, single-player skirmish + campaign vertical slice  
**Bahasa dokumen:** Indonesia

> Nama kerja “Iron Crown” hanya placeholder. Seluruh nama, faksi, peta, ilustrasi, unit, bangunan, ikon, suara, UI, animasi, cerita, dan kode harus dibuat orisinal atau dilisensikan. Game mengambil inspirasi umum dari RTS sejarah dan tidak menggunakan aset atau ekspresi khas Age of Empires.

## 1. Ringkasan produk

Iron Crown adalah RTS sejarah-fantasi rendah tentang kerajaan-kerajaan yang berebut tanah, perdagangan, dan legitimasi selama empat era: Zaman Kelam, Feodal, Kastel, dan Imperial. Pemain mengumpulkan sumber daya, membangun permukiman, menaikkan era, melatih pasukan, dan mengalahkan lawan melalui pertempuran taktis real-time.

Pengalaman inti yang dituju: mudah dibaca dari kamera tinggi, keputusan ekonomi penting, pertarungan dengan counter unit yang jelas, dan identitas peradaban yang terasa berbeda tanpa membuat semua faksi perlu dipelajari ulang.

## 2. Visi dan sasaran

### Visi

Membuat RTS sejarah yang memberi fantasi membangun kerajaan dari permukiman rapuh menjadi kekuatan imperial, dengan unit, budaya visual, dan taktik yang orisinal.

### Sasaran produk

- Pertandingan skirmish 1v1 melawan AI berdurasi 20–35 menit.
- Pemain baru dapat memahami siklus dasar dalam tutorial singkat.
- Tiap peradaban punya gaya bermain, bonus ekonomi, dan unit khas yang relevan.
- Era baru terasa sebagai perubahan strategi, bukan sekadar angka statistik.
- Konten awal dapat dikembangkan oleh tim kecil melalui modularitas aset dan data.

### Bukan sasaran rilis awal

- Salinan satu-banding-satu dari game RTS tertentu.
- Multiplayer kompetitif, co-op, editor peta, mod workshop, kampanye bercabang besar.
- Simulasi sejarah akademis atau representasi semua budaya dunia.
- Monetisasi pay-to-win atau loot box.

## 3. Pemain dan platform

**Pemain utama:** penggemar RTS klasik, strategi sejarah, dan pertandingan skirmish; pemain yang ingin membangun ekonomi sambil mengatur pertempuran.

**Platform rilis awal:** Windows PC, kontrol mouse dan keyboard. Steam Deck dan macOS dievaluasi setelah prototipe performa.

**Perspektif:** kamera isometrik/3D ortografis dari atas dengan rotasi terbatas atau tanpa rotasi pada MVP agar keterbacaan peta konsisten.

## 4. Pilar pengalaman

1. **Bangun lalu bertempur:** warga mengubah peta menjadi ekonomi dan pertahanan.
2. **Taktik yang terbaca:** kelas unit, jangkauan, armor, moral/ketahanan, dan counter terlihat jelas.
3. **Kemajuan empat era:** unlock teknologi dan unit membuka pilihan strategi baru.
4. **Peradaban punya karakter:** arsitektur, palet, suara, bonus, dan roster membentuk identitas.
5. **Dunia yang terasa hidup:** warga bekerja, pasukan bergerak dalam formasi longgar, bangunan bereaksi saat dibangun atau diserang.

## 5. Core gameplay loop

1. Mulai dengan pusat permukiman, sejumlah warga, pengintai, dan sumber daya awal.
2. Pilih prioritas warga: pangan, kayu, batu, atau besi.
3. Jelajahi peta berkabut dan temukan sumber daya serta lawan.
4. Bangun fasilitas ekonomi, rumah, dan pertahanan.
5. Penuhi biaya dan syarat untuk naik era.
6. Riset teknologi dan pilih komposisi pasukan.
7. Serang, bertahan, mengganggu ekonomi, atau menguasai titik strategis.
8. Menang dengan menghancurkan pusat komando utama lawan atau melalui kondisi skenario.

## 6. Era dan perkembangan

| Era | Tema | Bangunan/unit utama | Perubahan bermain |
|---|---|---|---|
| Zaman Kelam | Permukiman rapuh, palisade, milisi | Pusat permukiman, pondok, lumbung, kapak kampung, pengintai | Scout dan ekonomi dasar; pilihan awal ekspansi atau pertahanan |
| Feodal | Manorialisme, pasukan levy, bengkel | Manor, pasar kecil, barak, pemanah, tombak, kavaleri ringan | Serangan awal terarah, perdagangan lokal, pertahanan perimeter |
| Kastel | Kekuasaan bangsawan, mesin kepung, benteng batu | Kastel, pandai besi, kandang, siege workshop | Pengepungan, unit elit, pertarungan memperebutkan benteng/titik peta |
| Imperial | Administrasi terpusat, tentara profesional | Balai imperial, akademi, gudang besar, artileri era sesuai setting | Upgrade akhir, logistik, unit profesional, penyelesaian pertandingan |

**Catatan setting:** “Imperial” adalah era internal game, bukan klaim bahwa semua peradaban historis mengalami urutan yang sama. Penamaan dan teknologi peradaban dapat disesuaikan agar tidak memaksakan garis waktu tunggal.

**Kenaikan era:** melalui bangunan/keputusan pusat dengan biaya sumber daya dan waktu riset. Syarat era dapat bervariasi per skenario; MVP memakai satu aturan konsisten.

## 7. Peradaban awal

Roster MVP disarankan empat peradaban. Nama berikut adalah nama kerja orisinal; riset sejarah dan sensitivitas budaya perlu dilakukan sebelum produksi final.

| Peradaban kerja | Identitas visual | Gaya bermain | Bonus/unit khas (konsep) |
|---|---|---|---|
| Kerajaan Arven | Batu kapur, merah tua, lambang rusa | Pertahanan dan infanteri disiplin | Perbaikan benteng lebih efisien; penjaga perisai |
| Liga Sagara | Pelabuhan, kayu gelap, nila dan tembaga | Perdagangan dan mobilitas pesisir | Kapal dagang/karavan lebih kuat; pemanah pantai |
| Konfederasi Qamar | Benteng gurun, kain hijau, geometri bintang orisinal | Mobilitas, pengintaian, kavaleri | Pengintai mendapat visi lebih luas; penunggang tombak |
| Kadipaten Veyra | Hutan perbukitan, biru baja, lambang bangau | Ekonomi hutan dan penyergapan | Penebangan efisien; pemanah hutan |

**Aturan desain faksi:** bonus harus memberi pilihan, bukan keuntungan universal; satu bonus ekonomi, satu aksen militer/teknologi, satu unit atau teknologi khas; semua punya counter yang tersedia bagi lawan.

## 8. Unit dan peran

### Ekonomi dan dukungan
- **Warga:** membangun, memperbaiki, mengumpulkan sumber daya; lemah dalam tempur.
- **Pengintai:** cepat, visi luas, serangan rendah; tidak efektif melawan bangunan.
- **Karavan/kapal dagang (opsional peta):** menghasilkan pendapatan saat menempuh rute.
- **Tabib/pendeta (fase setelah MVP):** dukungan terbatas, tanpa konversi unit di MVP.

### Militer
- **Milisi/infanteri pedang:** unit umum jarak dekat.
- **Tombak:** counter kavaleri, rapuh terhadap panah.
- **Pemanah:** serangan jarak jauh, lemah dalam jarak dekat dan terhadap perlindungan.
- **Kavaleri ringan:** flanking/mengejar, mahal dan rentan tombak.
- **Kavaleri berat:** daya tahan dan charge tinggi, biaya besar.
- **Pemanah berkuda:** mobilitas dan gangguan, damage rendah.
- **Mesin kepung:** merusak bangunan/dinding, bergerak lambat dan butuh perlindungan.
- **Artileri era imperial:** jangkauan dan damage tinggi, biaya/risiko tinggi.

Stat utama: HP, armor tipe (ringan/berat/struktur), damage per tipe, jangkauan, kecepatan gerak, kecepatan serang, sight, biaya, waktu produksi, populasi, kelas counter, dan kebutuhan formasi/transport jika berlaku.

## 9. Ekonomi dan bangunan

### Sumber daya MVP
- **Pangan:** warga, infanteri, dan kenaikan era tertentu.
- **Kayu:** bangunan, kapal, pemanah, mesin kepung.
- **Batu:** dinding, menara, kastel, pusat pertahanan.
- **Besi:** persenjataan, armor, pasukan berat dan siege.
- **Koin:** perdagangan, teknologi/mercenary skenario; pertimbangkan ditiadakan di skirmish awal untuk mengurangi beban UI.

### Bangunan
- **Pusat permukiman:** produksi warga, pusat komando, titik garrison.
- **Rumah/manor:** menambah batas populasi.
- **Lumbung/padang kerja:** drop-off dan peningkatan ekonomi pangan.
- **Kamp penebang/tambang:** titik drop-off sumber daya.
- **Barak:** infanteri dan tombak.
- **Lapangan panah:** pemanah.
- **Kandang:** kavaleri.
- **Pandai besi:** upgrade senjata dan armor.
- **Pasar:** perdagangan dan pertukaran sumber daya terbatas.
- **Menara:** pengintaian/pertahanan lokal.
- **Dinding dan gerbang:** kendali jalur serta perlindungan.
- **Kastel:** landmark pertahanan, produksi unit elit atau fungsi unik faksi.
- **Bengkel kepung:** mesin pengepung.

Setiap bangunan punya biaya, waktu bangun, footprint grid, HP, armor, status konstruksi, animasi tahap pembangunan, aturan garrison, dan kondisi runtuh.

## 10. Sistem permainan

### Kontrol
- Klik pilih unit/bangunan; drag-select untuk kelompok.
- Klik kanan untuk bergerak/menyerang/mengumpulkan sesuai target konteks.
- Tombol serang, tahan posisi, mundur, patrol, garrison, dan formasi.
- Control group 1–9; hotkey dapat diubah; panel produksi dengan antrean dan rally point.
- Kamera pan, zoom, edge scroll opsional; minimap dengan ping lokal.

### Pertempuran
- Simulasi real-time dengan jeda taktis hanya pada single-player (opsional pengaturan).
- Auto-acquire target dan prioritas target yang dapat diubah.
- Fog of war: area belum terjelajah berkabut; unit musuh hilang dari penglihatan setelah keluar sight.
- Cover medan memberi bonus defensif terbatas dan mudah dibaca.
- Formasi MVP: bebas, garis, rapat/perisai, dan wedge untuk kavaleri; bonus kecil dengan tradeoff mobilitas.
- Pathfinding menghindari unit dan bangunan; unit tidak boleh menumpuk sempurna.
- Pengepungan: serangan biasa efektif rendah terhadap dinding; siege menjadi jawaban utama.

### Kemenangan dan kekalahan
- **Skirmish standar:** hancurkan pusat komando utama lawan.
- **Opsional:** eliminasi seluruh bangunan produksi/komando, kemenangan relic/landmark, atau batas skor pada mode skenario.
- Pemain kalah saat kondisi skenario terpenuhi; hasil AI tidak boleh dianggap menang jika masih ada pasukan/struktur valid.

### AI
- Tingkat kesulitan mengubah prioritas, scouting, komposisi pasukan, dan kecepatan keputusan; jangan memberi AI sumber daya tersembunyi di mode standar.
- Kepribadian AI: ekspansi ekonomi, tekanan awal, pertahanan, atau pengepungan.
- AI memiliki state yang dapat didiagnosis: ekonomi, pertahanan, eksplorasi, komposisi pasukan, tujuan serangan.

## 11. Campaign dan skenario

**Vertical slice:** prolog 3 misi berpusat pada tokoh dan konflik fiktif, dengan pengenalan tutorial bertahap.

- Misi 1: ekonomi dan eksplorasi.
- Misi 2: bertahan dari serangan dan mengenal counter unit.
- Misi 3: membangun mesin kepung dan menyerbu benteng.

**Campaign penuh setelah validasi:** 8–12 misi per campaign, objektif utama dan sampingan, briefing peta, momen cerita yang dibuat orisinal. Tidak memakai tokoh, dialog, nama misi, peta, atau struktur campaign dari game lain.

## 12. Seni, animasi, dan suara

### Arah seni
- Realisme bergaya/hand-painted 3D atau 2.5D, siluet dan warna unit terbaca pada ukuran kecil.
- Arsitektur mengacu pada riset era/budaya yang dipilih, lalu diterjemahkan menjadi desain konsisten dan orisinal.
- Hindari lambang, palet, bentuk ikon, layout UI, model, tekstur, pose, dan efek yang dapat dikenali sebagai salinan aset pihak lain.
- Efek serangan sederhana dan tidak menutupi unit; warna tim hadir pada aksen kain/perisai, bukan mewarnai seluruh model.

### Daftar aset visual
**Karakter/unit:** warga (varian tubuh/pekerjaan), pengintai, infanteri ringan/berat, tombak, pemanah, kavaleri dan kuda, unit unik tiap peradaban, awak siege.

**Bangunan:** pusat komando, rumah, lumbung, kamp penebang, tambang, barak, lapangan panah, kandang, pandai besi, pasar, menara, kastel, bengkel siege, dinding, gerbang, dermaga opsional.

**Lingkungan:** terrain rumput, tanah, salju, gurun, hutan, batu, pesisir; pohon per tipe; semak; batu/mineral; bangkai; jalan; jembatan; air dangkal/dalam; dekorasi desa; props pertanian; reruntuhan; objek relic.

**UI/2D:** ikon unit/bangunan/teknologi/sumber daya; kursor kontekstual; portrait faksi; panel produksi; pohon teknologi; minimap; marker ping; indikator seleksi, HP, armor, status produksi, tutorial, notifikasi.

**Efek:** debu langkah, percikan benturan, jejak panah, impact, api/asap, runtuh, konstruksi, panen, pohon tumbang, splash air, obor, cuaca opsional.

**Animasi unit umum:** idle variasi, jalan, lari, putar, serang utama/sekunder, menerima hit, stagger, mati, kerja/mengumpulkan, membangun, memperbaiki, membawa barang, menembakkan proyektil, reload, menaiki/menunggangi kuda, garrison/keluar, victory/celebration seperlunya.

**Animasi bangunan:** fondasi, tahap konstruksi, selesai, bendera/ornamen idle, pintu/gerbang buka-tutup, menerima damage bertahap, terbakar, runtuh, efek produksi.

**Animasi lingkungan:** pohon bergoyang/roboh, air, rumput/partikel angin, api obor, hewan kecil opsional.

### Audio
- Musik tema utama orisinal; lapisan musik berubah menurut eksplorasi/ancaman/pertempuran.
- Ambience biome: angin, burung, hutan, pasar, pesisir.
- SFX antarmuka, ekonomi, konstruksi, produksi, serangan tiap kelas, armor/hit, siege, alarm, victory/defeat.
- Voice line pendek dan orisinal untuk konfirmasi perintah; tidak meniru frasa atau suara dari game lain.
- Dialog campaign dengan casting dan hak penggunaan yang jelas.

### Spesifikasi pipeline aset (awal, finalisasi bersama art lead)
- Unit: modular rig/attachment, LOD, tekstur atlas, variasi warna tim lewat material.
- Animasi: locomotion blend, root motion hanya bila kontrol tidak terganggu, state transition tanpa snapping.
- Bangunan: modul/damage state agar variasi dapat dibuat dari kit.
- Semua aset dicatat dalam katalog: ID, pemilik/pembuat, lisensi, versi, sumber, batas penggunaan, dan status review.
- Gunakan placeholder yang diberi label sampai aset final lolos tinjauan visual dan legal.

## 13. UI/UX

- HUD menunjukkan stok sumber daya, populasi, usia/era, minimap, panel seleksi, antrean produksi, dan tujuan aktif.
- Unit terseleksi punya indikator tanah yang kontras dengan terrain.
- Counter unit dijelaskan melalui tooltip dan ikon, bukan angka tersembunyi saja.
- Tutorial kontekstual dapat dimatikan dan diulang.
- Opsi aksesibilitas: ukuran UI, skala teks, colorblind-safe team colors, subtitle, remap hotkeys, camera edge-scroll toggle, kecepatan game single-player.
- Pesan log dan suara memberi informasi ancaman tanpa spam; tingkat notifikasi dapat diatur.

## 14. Mode dan konten MVP

**MVP playable:**
- 1 biome utama dengan 2 varian layout dan generator peta sederhana.
- 2 peradaban lengkap untuk skirmish; 4 peradaban masuk vertical slice jika kapasitas konten cukup.
- Keempat era, sekitar 12–16 unit, 12–15 bangunan, 10–15 teknologi.
- AI satu lawan dengan 3 profil kesulitan.
- Tutorial 3 langkah dan 1 skenario campaign.
- Save/load single-player, pause, pengaturan dasar, layar kemenangan/kekalahan.

**Konten setelah MVP:** tambahan biome, 2 faksi berikutnya, campaign penuh, skenario, editor peta, replay, multiplayer.

## 15. Non-functional requirements

- Target 60 FPS pada PC spesifikasi menengah yang disepakati setelah benchmark; target perangkat dan GPU ditentukan saat prototype.
- Skala simulasi: target 300 unit hidup pada peta standar, diuji dengan hardware minimum.
- Input selection dan command harus terasa responsif; latensi perintah lokal ditargetkan di bawah 100 ms pada kondisi normal.
- Autosave aman saat jeda antar-misi; skirmish save dibuat atomik.
- Tutorial dan skirmish bisa dimainkan offline.
- Crash recovery menyimpan log tanpa data pribadi yang tidak perlu.
- Arsitektur data-driven untuk definisi unit, bangunan, teknologi, biaya, dan faksi.
- Lokalisi awal: Bahasa Indonesia dan Inggris; dukungan font/teks ekspansif.

## 16. Telemetri dan metrik keberhasilan

Telemetri opt-in dan minim data pribadi.

- Persentase pemain yang menyelesaikan tutorial.
- Waktu menuju produksi unit pertama dan kenaikan era pertama.
- Persentase skirmish selesai dan alasan keluar.
- Keragaman komposisi unit serta tingkat kemenangan tiap faksi/AI.
- Frekuensi bangunan/teknologi yang tidak pernah dipakai.
- Frame rate, pathfinding failures, crash rate, waktu loading.

Ambang sasaran ditetapkan setelah uji pemain; jangan memakai metrik engagement untuk mendorong sesi yang tidak sehat.

## 17. Risiko dan mitigasi

- **Scope konten terlalu besar:** produksi empat faksi penuh mahal; validasi dengan dua faksi dan satu biome lebih dulu.
- **Pathfinding dan performa:** buat prototype ribuan command/kelompok dan 300 unit sejak awal.
- **Keterbacaan visual:** uji silhouette pada zoom-out dan colorblind palettes.
- **Ketidakseimbangan:** telemetri dan test skenario tiap patch; faksi tidak boleh memiliki counter yang tak terjawab.
- **Akurasi/sensitivitas sejarah:** konsultan budaya/sejarah untuk representasi final; jelaskan setting komposit/fiktif.
- **Risiko IP:** semua aset dibuat sendiri, dipesan dengan kontrak hak komersial, atau memakai lisensi yang diperiksa; simpan provenance dan jangan menyalin model, ikon, audio, nama, teks, peta, atau animasi dari game lain.
- **AI terasa curang:** tampilkan tingkat kesulitan dan larang bonus tersembunyi di mode standar.

## 18. Pertanyaan terbuka

- Engine dan pipeline target: Godot, Unity, Unreal, atau teknologi lain?
- Gaya kamera: 2D/isometrik, 2.5D, atau 3D penuh?
- Setting lebih realistis-historis atau dunia fiktif yang terinspirasi sejarah?
- Bahasa voice-over dan prioritas platform rilis?
- Apakah koin menjadi resource inti atau hanya untuk skenario perdagangan?
- Multiplayer masuk sasaran bisnis awal atau fase lanjutan?
- Nama dan identitas visual final peradaban setelah riset budaya.

## 19. Kriteria penerimaan vertical slice

- Pemain baru dapat menyelesaikan tutorial tanpa bantuan eksternal.
- Ekonomi dasar, bangun, produksi pasukan, kenaikan era, scouting, combat, dan victory condition berjalan dalam satu sesi skirmish.
- Empat era menunjukkan unlock yang terlihat dan berdampak pada strategi.
- Minimal dua komposisi unit yang layak dapat menang melawan AI pada kesulitan normal.
- Tidak ada unit yang tersangkut permanen pada skenario uji standar.
- UI tetap terbaca pada resolusi target dan variasi colorblind utama.
- Semua aset dalam slice mempunyai provenance dan izin penggunaan yang tercatat.
