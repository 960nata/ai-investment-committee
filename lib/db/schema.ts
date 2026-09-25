import {
  pgTable,
  pgEnum,
  serial,
  text,
  varchar,
  timestamp,
  date,
  numeric,
  integer,
  bigint,
  smallint,
  doublePrecision,
  real,
  boolean,
  jsonb,
  primaryKey,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

// ---------------------------------------------------------------------------
// Enum
// ---------------------------------------------------------------------------

/** Tempat dan kalender perdagangan. `global` untuk berjangka emas dan komoditi. */
export const marketEnum = pgEnum('market', ['crypto', 'idx', 'us', 'global'])

/**
 * Jenis aset, terpisah dari tempat ia diperdagangkan.
 *
 * Keduanya memang beda pertanyaan. Emas bisa dibeli lewat kontrak berjangka
 * maupun lewat token di bursa crypto; kalendernya berbeda, tetapi yang dibeli
 * benda yang sama. Menyatukan keduanya jadi satu kolom memaksa memilih salah
 * satu pertanyaan dan kehilangan jawaban yang lain.
 */
export const assetClassEnum = pgEnum('asset_class', [
  'crypto',
  // Dipisah dari crypto dengan sengaja. Koin meme tidak punya pendapatan,
  // jadwal unlock yang bermakna, maupun aktivitas jaringan yang menjelaskan
  // harganya — yang menggerakkannya perhatian orang, dan itu jenis risiko yang
  // berbeda. Mencampurnya ke satu tab membuat keduanya terlihat setara.
  'memecoin',
  'saham',
  'emas',
  'komoditi',
  'indeks',
])
export const healthStatusEnum = pgEnum('health_status', ['healthy', 'degraded', 'dead'])
export const jobStatusEnum = pgEnum('job_status', ['running', 'success', 'failed', 'partial'])

// ---------------------------------------------------------------------------
// Fakta mentah
// ---------------------------------------------------------------------------

export const instrument = pgTable(
  'instrument',
  {
    id: serial('id').primaryKey(),
    symbol: varchar('symbol', { length: 32 }).notNull(),
    name: text('name').notNull(),
    market: marketEnum('market').notNull(),
    assetClass: assetClassEnum('asset_class').notNull().default('crypto'),
    /** Negara atau kawasan, dipakai untuk mengelompokkan dan memberi bendera. */
    region: varchar('region', { length: 48 }),
    currency: varchar('currency', { length: 8 }).notNull(),
    sector: text('sector'),
    isActive: boolean('is_active').notNull().default(true),
    listedAt: date('listed_at'),
    // Diisi saat delisting. Instrumen delisting TIDAK dihapus — kalau dihapus,
    // backtest kena survivorship bias.
    delistedAt: date('delisted_at'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('instrument_market_symbol_uq').on(t.market, t.symbol),
    index('instrument_market_idx').on(t.market),
    index('instrument_asset_class_idx').on(t.assetClass),
  ],
)

/** Satu instrumen bisa punya simbol berbeda di tiap sumber: BBCA / BBCA.JK / IDX:BBCA. */
export const symbolAlias = pgTable(
  'symbol_alias',
  {
    instrumentId: integer('instrument_id')
      .notNull()
      .references(() => instrument.id, { onDelete: 'cascade' }),
    sourceId: varchar('source_id', { length: 32 }).notNull(),
    alias: varchar('alias', { length: 64 }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.instrumentId, t.sourceId] }),
    uniqueIndex('symbol_alias_source_alias_uq').on(t.sourceId, t.alias),
  ],
)

/**
 * Harga harian. Nilai numerik disimpan sebagai `numeric`, bukan float —
 * driver mengembalikannya sebagai string, jadi tidak ada galat pembulatan biner.
 */
export const candleDaily = pgTable(
  'candle_daily',
  {
    instrumentId: integer('instrument_id')
      .notNull()
      .references(() => instrument.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    open: numeric('open', { precision: 20, scale: 8 }).notNull(),
    high: numeric('high', { precision: 20, scale: 8 }).notNull(),
    low: numeric('low', { precision: 20, scale: 8 }).notNull(),
    close: numeric('close', { precision: 20, scale: 8 }).notNull(),
    volume: numeric('volume', { precision: 28, scale: 8 }).notNull(),
    // Diisi setelah aksi korporasi terekam; null berarti belum disesuaikan.
    adjClose: numeric('adj_close', { precision: 20, scale: 8 }),
    sourceId: varchar('source_id', { length: 32 }).notNull(),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.instrumentId, t.date] }),
    index('candle_daily_date_idx').on(t.date),
  ],
)

// ---------------------------------------------------------------------------
// Operasional
// ---------------------------------------------------------------------------

export const dataSourceHealth = pgTable('data_source_health', {
  sourceId: varchar('source_id', { length: 32 }).primaryKey(),
  status: healthStatusEnum('status').notNull().default('healthy'),
  consecutiveFailures: integer('consecutive_failures').notNull().default(0),
  lastError: text('last_error'),
  lastSuccessAt: timestamp('last_success_at', { withTimezone: true }),
  checkedAt: timestamp('checked_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * Penjadwalan halus ada di sini, bukan di vercel.json — tier Hobby hanya
 * mengizinkan sedikit cron, jadi satu dispatcher per jam membaca tabel ini.
 */
export const jobSchedule = pgTable('job_schedule', {
  jobName: varchar('job_name', { length: 64 }).primaryKey(),
  // Jam dalam sehari saat job jatuh tempo, pada zona waktu di bawah.
  hoursOfDay: jsonb('hours_of_day').$type<number[]>().notNull(),
  timezone: varchar('timezone', { length: 48 }).notNull().default('UTC'),
  // false untuk job yang jalan tiap hari termasuk akhir pekan (crypto).
  tradingDaysOnly: boolean('trading_days_only').notNull().default(false),
  market: marketEnum('market'),
  enabled: boolean('enabled').notNull().default(true),
  lastRunAt: timestamp('last_run_at', { withTimezone: true }),
})

export const jobRun = pgTable(
  'job_run',
  {
    id: serial('id').primaryKey(),
    jobName: varchar('job_name', { length: 64 }).notNull(),
    // Identitas satu batch di dalam satu job. Bersama job_name ia unik, sehingga
    // QStash boleh mengirim ulang batch yang sama tanpa menggandakan baris.
    batchKey: varchar('batch_key', { length: 128 }).notNull(),
    status: jobStatusEnum('status').notNull().default('running'),
    itemsProcessed: integer('items_processed').notNull().default(0),
    itemsFailed: integer('items_failed').notNull().default(0),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    // Kursor untuk job bertahap (backfill) supaya bisa dilanjut antar-invocation.
    cursor: jsonb('cursor').$type<Record<string, unknown> | null>(),
    stats: jsonb('stats').$type<Record<string, unknown> | null>(),
    error: text('error'),
  },
  (t) => [
    uniqueIndex('job_run_job_batch_uq').on(t.jobName, t.batchKey),
    index('job_run_job_started_idx').on(t.jobName, t.startedAt),
  ],
)

/**
 * Baris yang gagal uji kualitas. Dikarantina, bukan dibuang — sebagian besar
 * anomali ternyata aksi korporasi yang belum terekam.
 */
export const ingestQuarantine = pgTable(
  'ingest_quarantine',
  {
    id: serial('id').primaryKey(),
    instrumentId: integer('instrument_id').references(() => instrument.id, {
      onDelete: 'cascade',
    }),
    sourceId: varchar('source_id', { length: 32 }).notNull(),
    payload: jsonb('payload').notNull(),
    reason: text('reason').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('ingest_quarantine_created_idx').on(t.createdAt)],
)

// ---------------------------------------------------------------------------
// Kosakata pasar
// ---------------------------------------------------------------------------

/**
 * Lapisan adaptor memakai 'CRYPTO' | 'IDX' | 'US'; kolom Postgres memakai huruf
 * kecil. Dua fungsi di bawah adalah satu-satunya tempat kedua kosakata bertemu —
 * di luar sini tidak ada perbandingan string pasar yang ditulis tangan.
 */
export type MarketCode = 'CRYPTO' | 'IDX' | 'US' | 'GLOBAL'
export type DbMarket = (typeof marketEnum.enumValues)[number]

export function toDbMarket(market: MarketCode): DbMarket {
  return market.toLowerCase() as DbMarket
}

export function fromDbMarket(market: DbMarket): MarketCode {
  return market.toUpperCase() as MarketCode
}

export type AssetClass = (typeof assetClassEnum.enumValues)[number]

/** Urutan tampil di antarmuka, dari yang paling banyak datanya. */
export const ASSET_CLASSES: { id: AssetClass; label: string }[] = [
  { id: 'crypto', label: 'Crypto' },
  { id: 'memecoin', label: 'Meme Coin' },
  { id: 'saham', label: 'Saham' },
  { id: 'emas', label: 'Emas' },
  { id: 'komoditi', label: 'Komoditi' },
  { id: 'indeks', label: 'Indeks' },
]

/**
 * Tata letak tab di antarmuka, dengan pengelompokan.
 *
 * Crypto dan meme coin satu tab karena keduanya diperdagangkan di bursa yang
 * sama. Tapi profil risikonya berbeda, jadi di dalam tab itu ada sub-filter
 * supaya pengguna bisa melihat masing-masing secara terpisah.
 */
export interface TabGroup {
  id: string
  label: string
  /** Kelas aset yang termasuk di tab ini. Kalau lebih dari satu, sub-tab muncul. */
  children: { id: AssetClass; label: string }[]
}

export const TAB_LAYOUT: TabGroup[] = [
  {
    id: 'crypto',
    label: 'Crypto',
    children: [
      { id: 'crypto', label: 'Crypto' },
      { id: 'memecoin', label: 'Meme Coin' },
    ],
  },
  { id: 'saham', label: 'Saham', children: [{ id: 'saham', label: 'Saham' }] },
  { id: 'emas', label: 'Emas', children: [{ id: 'emas', label: 'Emas' }] },
  { id: 'komoditi', label: 'Komoditi', children: [{ id: 'komoditi', label: 'Komoditi' }] },
  { id: 'indeks', label: 'Indeks', children: [{ id: 'indeks', label: 'Indeks' }] },
]

export type Instrument = typeof instrument.$inferSelect
export type NewInstrument = typeof instrument.$inferInsert
export type CandleRow = typeof candleDaily.$inferSelect
export type NewCandleRow = typeof candleDaily.$inferInsert

// ---------------------------------------------------------------------------
// Komite agen
// ---------------------------------------------------------------------------

export const agentSessionStatusEnum = pgEnum('agent_session_status', [
  'running',
  'done',
  'failed',
])

/** Putusan akhir komite. 'abstain' dipakai saat datanya sendiri tidak layak dinilai. */
export const agentVerdictEnum = pgEnum('agent_verdict', ['beli', 'tahan', 'jual', 'abstain'])

/**
 * Satu rapat komite atas satu instrumen.
 *
 * `sessionKey` adalah kunci idempotensi yang sama perannya dengan `batchKey` di
 * `job_run`: QStash boleh mengirim ulang rapat yang sama tanpa melahirkan rapat
 * kedua. Tanpa itu, satu retry menghasilkan dua putusan yang bisa berbeda isi.
 */
export const agentSession = pgTable(
  'agent_session',
  {
    id: serial('id').primaryKey(),
    sessionKey: varchar('session_key', { length: 128 }).notNull(),
    instrumentId: integer('instrument_id').references(() => instrument.id, {
      onDelete: 'cascade',
    }),
    market: marketEnum('market').notNull(),
    symbol: varchar('symbol', { length: 32 }).notNull(),
    status: agentSessionStatusEnum('status').notNull().default('running'),
    verdict: agentVerdictEnum('verdict'),
    /** 0–100. Rendah bukan berarti salah, melainkan bahwa buktinya tipis. */
    confidence: integer('confidence'),
    rationale: text('rationale'),
    /**
     * Fakta persis yang dilihat komite saat memutuskan. Disimpan, bukan dihitung
     * ulang saat dibaca: menilai putusan lama dengan data baru membuat semua
     * putusan tampak keliru, karena harganya memang sudah berubah.
     */
    factsSnapshot: jsonb('facts_snapshot').$type<Record<string, unknown> | null>(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    error: text('error'),
  },
  (t) => [
    uniqueIndex('agent_session_key_uq').on(t.sessionKey),
    index('agent_session_symbol_idx').on(t.market, t.symbol, t.startedAt),
  ],
)

/**
 * Satu giliran bicara di dalam rapat.
 *
 * Transkrip disimpan utuh, bukan hanya kesimpulannya. Putusan agen yang tidak
 * bisa ditelusuri ke argumen yang melahirkannya tidak bisa diperbaiki — saat
 * hasilnya buruk, tidak ada cara tahu apakah datanya, prompt-nya, atau modelnya
 * yang salah.
 */
export const agentMessage = pgTable(
  'agent_message',
  {
    id: serial('id').primaryKey(),
    sessionId: integer('session_id')
      .notNull()
      .references(() => agentSession.id, { onDelete: 'cascade' }),
    /** Urutan bicara di dalam rapat, mulai dari 0. */
    seq: integer('seq').notNull(),
    /** Peran agen: 'analis' | 'strateg' | 'risiko' | 'ketua'. */
    agent: varchar('agent', { length: 32 }).notNull(),
    content: text('content').notNull(),
    /** Penyedia yang benar-benar menjawab — bisa berbeda tiap giliran karena failover. */
    providerId: varchar('provider_id', { length: 32 }),
    model: varchar('model', { length: 64 }),
    /** Indeks kunci di kolam, bukan kuncinya. */
    keyIndex: integer('key_index'),
    latencyMs: integer('latency_ms'),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Giliran yang sama tidak boleh tercatat dua kali saat batch diulang.
    uniqueIndex('agent_message_session_seq_uq').on(t.sessionId, t.seq),
  ],
)

export type AgentSessionRow = typeof agentSession.$inferSelect
export type AgentMessageRow = typeof agentMessage.$inferSelect
export type AgentVerdict = (typeof agentVerdictEnum.enumValues)[number]

// ---------------------------------------------------------------------------
// Turunan: fitur harian
// ---------------------------------------------------------------------------

/**
 * Hasil hitungan engine fitur, satu baris per instrumen per hari per versi.
 *
 * Fakta mentah dan hasil turunan dipisah total. Tabel `candle_daily` tidak
 * pernah ditimpa oleh proses ini; seluruh isi tabel di bawah selalu bisa dibuang
 * dan dihitung ulang dari nol. Tanpa pemisahan itu, backtest jadi bohong karena
 * data historisnya diam-diam ikut berubah setiap kali formula disempurnakan.
 *
 * `feature_set_version` ikut jadi bagian kunci utama, bukan sekadar kolom
 * penanda. Dua versi formula boleh hidup berdampingan atas tanggal yang sama,
 * dan itulah yang membuat perbandingan performa antar versi mungkin dilakukan.
 */
export const featureDaily = pgTable(
  'feature_daily',
  {
    instrumentId: integer('instrument_id')
      .notNull()
      .references(() => instrument.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    featureSetVersion: varchar('feature_set_version', { length: 32 }).notNull(),
    /**
     * Nilai fitur sebagai deret angka, sejajar dengan `feature_key_set.keys`
     * untuk versi yang sama. Dulunya objek jsonb bernama-jelas, tetapi 159 nama
     * kunci yang diulang di tiap baris menghabiskan tiga perempat ukurannya:
     * ±2 KB per baris jadi ±0,5 KB. `real` (float4) cukup untuk indikator dan
     * skor-z; harga mentah tetap `numeric` di `candle_daily`.
     *
     * Jangan dibaca langsung. Pakai fungsi di `queries.ts`, yang mengubahnya
     * kembali jadi objek `{ nama: nilai }`.
     */
    values: real('values').array().$type<(number | null)[]>().notNull(),
    computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.instrumentId, t.date, t.featureSetVersion] }),
    index('feature_daily_version_date_idx').on(t.featureSetVersion, t.date),
  ],
)

/**
 * Urutan kunci fitur per versi — kamus untuk membaca `feature_daily.values`.
 *
 * Hanya boleh bertambah di ujung, tidak pernah diubah urutannya: deret yang
 * sudah tersimpan menunjuk kunci lewat posisinya. Kunci baru (misalnya `_zcs`
 * dari job lintas penampang) ditambahkan di belakang, dan baris lama yang
 * lebih pendek otomatis terbaca null untuk kunci itu.
 */
export const featureKeySet = pgTable('feature_key_set', {
  featureSetVersion: varchar('feature_set_version', { length: 32 }).primaryKey(),
  keys: text('keys').array().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type FeatureRowRecord = Omit<typeof featureDaily.$inferSelect, 'values'> & {
  values: Record<string, number | null>
}

// ---------------------------------------------------------------------------
// Turunan: skor harian
// ---------------------------------------------------------------------------

export const horizonEnum = pgEnum('horizon', ['pendek', 'menengah', 'panjang'])
export const confidenceEnum = pgEnum('confidence', [
  'tinggi',
  'sedang',
  'rendah',
  'tidak memadai',
  // Berbeda arti dari "tidak memadai": yang ini tidak akan pernah terisi,
  // karena indeks dan komoditi memang tidak menerbitkan laporan keuangan.
  'tidak berlaku',
])

/**
 * Skor per instrumen per horizon per hari.
 *
 * `probability` sengaja boleh null, dan untuk sekarang selalu null. Skor mentah
 * baru berhak jadi persen setelah dikalibrasi lewat regresi logistik pada hasil
 * historis; sebelum itu ia hanya peringkat. Menyimpan 0,5 sebagai pengganti
 * akan membuat "belum tahu" tidak bisa dibedakan dari "kemungkinannya seimbang".
 *
 * `model_version` dan `feature_set_version` ikut jadi bagian kunci utama. Begitu
 * bobot atau rumus berubah, baris lama tetap mencerminkan model lamanya, dan
 * perbandingan performa antar versi tetap punya arti.
 */
export const scoreDaily = pgTable(
  'score_daily',
  {
    instrumentId: integer('instrument_id')
      .notNull()
      .references(() => instrument.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    horizon: horizonEnum('horizon').notNull(),
    modelVersion: varchar('model_version', { length: 32 }).notNull(),
    featureSetVersion: varchar('feature_set_version', { length: 32 }).notNull(),
    /** −10 sampai +10. */
    score: numeric('score', { precision: 6, scale: 3 }).notNull(),
    probability: numeric('probability', { precision: 5, scale: 4 }),
    confidence: confidenceEnum('confidence').notNull(),
    confidenceScore: numeric('confidence_score', { precision: 5, scale: 4 }).notNull(),
    /** Porsi bobot yang tidak punya data sama sekali, 0..1. */
    missingWeight: numeric('missing_weight', { precision: 5, scale: 4 }).notNull(),
    /** Pendorong pendukung dan penentang, beserta sumbangan masing-masing. */
    drivers: jsonb('drivers').$type<Record<string, unknown>>().notNull(),
    groups: jsonb('groups').$type<Record<string, unknown>[]>().notNull(),
    computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.instrumentId, t.date, t.horizon, t.modelVersion] }),
    index('score_daily_date_horizon_idx').on(t.date, t.horizon),
  ],
)

export type ScoreRow = typeof scoreDaily.$inferSelect

// ---------------------------------------------------------------------------
// Fakta mentah: laporan keuangan
// ---------------------------------------------------------------------------

export const periodTypeEnum = pgEnum('period_type', ['kuartal', 'tahunan'])

/**
 * Laporan keuangan per periode, satu baris per versi penyajian.
 *
 * Kunci utamanya memuat `source_accession`, nomor filing asalnya, bukan hanya
 * instrumen dan periode. Perusahaan menyajikan ulang laporannya: angka 2024 di
 * laporan 2024 berbeda dari angka 2024 yang muncul sebagai pembanding di
 * laporan 2025. Menimpa yang lama akan menghapus apa yang benar-benar diketahui
 * pasar saat itu, dan tanpa itu backtest jadi bohong.
 *
 * Menyimpan semua versi juga memberi satu fitur gratis: perusahaan yang sering
 * menyajikan ulang angkanya secara material punya kualitas pelaporan lebih
 * rendah, dan itu bisa dihitung.
 */
export const fundamentalQuarterly = pgTable(
  'fundamental_quarterly',
  {
    instrumentId: integer('instrument_id')
      .notNull()
      .references(() => instrument.id, { onDelete: 'cascade' }),
    /** Periode fiskal, misalnya "2026-Q3" atau "2026-FY". */
    period: varchar('period', { length: 12 }).notNull(),
    /** Nomor filing asal. Bagian kunci, bukan sekadar catatan. */
    sourceAccession: varchar('source_accession', { length: 40 }).notNull(),

    periodType: periodTypeEnum('period_type').notNull(),
    periodEnd: date('period_end').notNull(),
    /**
     * Tanggal laporan benar-benar terbit.
     *
     * Satu-satunya kolom yang membuat backtest jujur. Laporan kuartal pertama
     * terbit akhir April sampai Mei; memakainya pada 1 April adalah melihat
     * masa depan, dan itu sumber kebohongan paling umum di backtest amatir.
     */
    reportedAt: date('reported_at').notNull(),

    fiscalYear: integer('fiscal_year').notNull(),
    fiscalPeriod: varchar('fiscal_period', { length: 4 }).notNull(),
    currency: varchar('currency', { length: 8 }).notNull(),
    /**
     * Pengali satuan: nilai di `items` sudah dikalikan ini atau belum.
     *
     * EDGAR selalu melapor dalam satuan penuh, jadi di sana nilainya 1. XBRL IDX
     * tidak: satu emiten melapor dalam jutaan, yang lain dalam miliar, dan
     * atributnya ada di tiap elemen. Mengasumsikan satuan membuat rasio meleset
     * seribu kali lipat — kesalahan sebesar itu justru lolos dari pemeriksaan
     * yang mencari selisih kecil.
     */
    unitScale: integer('unit_scale').notNull().default(1),
    /**
     * Bulan tutup buku (1-12). Tidak semua emiten tutup buku di Desember, dan
     * menyamakan "Q1" semua emiten berarti membandingkan kuartal yang berbeda.
     */
    fiscalYearEndMonth: smallint('fiscal_year_end_month'),

    /** Pos kanonik dan nilainya. Pos yang tidak ada tidak muncul di sini. */
    items: jsonb('items').$type<Record<string, number>>().notNull(),
    /**
     * Pos wajib yang tidak ditemukan, disebut namanya.
     *
     * Membedakan "nilainya nol" dari "tidak ada datanya". Keduanya terlihat sama
     * kalau disimpan sebagai kosong, padahal artinya sangat berbeda bagi rumus
     * maupun bagi confidence.
     */
    missingItems: jsonb('missing_items').$type<string[]>().notNull(),
    /** Porsi pos wajib yang terisi, 0..1. Masuk langsung ke rumus confidence. */
    completeness: numeric('completeness', { precision: 5, scale: 4 }).notNull(),

    sourceId: varchar('source_id', { length: 32 }).notNull(),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.instrumentId, t.period, t.sourceAccession] }),
    // Penyaring utama tiap backtest: apa yang sudah terbit pada tanggal itu.
    index('fundamental_reported_idx').on(t.instrumentId, t.reportedAt),
  ],
)

export type FundamentalRow = typeof fundamentalQuarterly.$inferSelect

// ---------------------------------------------------------------------------
// Kepemilikan (KSEI)
// ---------------------------------------------------------------------------

/**
 * Urutan jenis investor di kolom `local` dan `foreign`, persis urutan kolom
 * berkas KSEI: asuransi, korporasi, dana pensiun, bank, individu, reksa dana,
 * perusahaan efek, yayasan, lainnya.
 */
export const KSEI_INVESTOR_TYPES = ['IS', 'CP', 'PF', 'IB', 'ID', 'MF', 'SC', 'FD', 'OT'] as const

/**
 * Komposisi kepemilikan efek per akhir bulan, dari berkas KSEI.
 *
 * Mengisi kelompok bobot "arus dana & kepemilikan" untuk saham IDX. Rinciannya
 * disimpan sebagai dua deret sembilan angka, bukan delapan belas kolom: bentuk
 * ini sejajar dengan berkas sumbernya dan tidak perlu diubah bila KSEI kelak
 * menambah jenis investor.
 */
export const ownershipMonthly = pgTable(
  'ownership_monthly',
  {
    instrumentId: integer('instrument_id')
      .notNull()
      .references(() => instrument.id, { onDelete: 'cascade' }),
    /** Tanggal posisi — akhir bulan di nama berkas. */
    asOf: date('as_of').notNull(),
    /**
     * Kapan data ini paling cepat bisa diketahui.
     *
     * Berkas posisi 31 Agustus baru terbit sekitar 1 September. Memakainya pada
     * 31 Agustus di backtest adalah melihat masa depan, persis seperti memakai
     * laporan keuangan sebelum tanggal terbitnya.
     */
    availableAt: date('available_at').notNull(),
    sharesListed: bigint('shares_listed', { mode: 'number' }).notNull(),
    price: numeric('price', { precision: 18, scale: 4 }),
    /** Lembar milik investor lokal, urutan `KSEI_INVESTOR_TYPES`. */
    local: bigint('local', { mode: 'number' }).array().notNull(),
    /** Lembar milik investor asing, urutan `KSEI_INVESTOR_TYPES`. */
    foreign: bigint('foreign', { mode: 'number' }).array().notNull(),
    localTotal: bigint('local_total', { mode: 'number' }).notNull(),
    foreignTotal: bigint('foreign_total', { mode: 'number' }).notNull(),
    sourceId: varchar('source_id', { length: 32 }).notNull().default('ksei'),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.instrumentId, t.asOf] }),
    index('ownership_available_idx').on(t.instrumentId, t.availableAt),
  ],
)

export type OwnershipRow = typeof ownershipMonthly.$inferSelect

// ---------------------------------------------------------------------------
// Makro
// ---------------------------------------------------------------------------

/**
 * Deret makro: imbal hasil obligasi, inflasi, pertumbuhan PDB.
 *
 * Bukan untuk menilai saham satu per satu, melainkan mengisi parameter model
 * jangka panjang — Rf, batas g_terminal, inflasi harapan. Satu tabel sempit
 * untuk semua deret: jumlahnya puluhan, barisnya ribuan, dan tidak ada gunanya
 * satu tabel per deret.
 */
export const macroSeries = pgTable(
  'macro_series',
  {
    /** Kode deret di sumbernya, misalnya `DGS10` (FRED) atau `IDN:FP.CPI.TOTL.ZG`. */
    seriesId: varchar('series_id', { length: 64 }).notNull(),
    date: date('date').notNull(),
    value: doublePrecision('value').notNull(),
    source: varchar('source', { length: 24 }).notNull(),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.seriesId, t.date] })],
)

// ---------------------------------------------------------------------------
// Rekonsiliasi antar sumber
// ---------------------------------------------------------------------------

/**
 * Selisih nilai satu pos antara dua sumber.
 *
 * Sumber peringkat lebih rendah tidak pernah menimpa yang lebih tinggi; fungsinya
 * sebagai pemeriksa silang. Selisih di atas 5% dicatat di sini, di atas 20%
 * ditandai untuk ditinjau manusia — selisih sebesar itu hampir selalu kesalahan
 * satuan, mata uang, atau pemetaan pos, dan ketiganya bug, bukan pilihan.
 */
export const reconciliationFlag = pgTable(
  'reconciliation_flag',
  {
    id: serial('id').primaryKey(),
    instrumentId: integer('instrument_id')
      .notNull()
      .references(() => instrument.id, { onDelete: 'cascade' }),
    period: varchar('period', { length: 12 }).notNull(),
    item: varchar('item', { length: 48 }).notNull(),
    sourceA: varchar('source_a', { length: 32 }).notNull(),
    valueA: doublePrecision('value_a').notNull(),
    sourceB: varchar('source_b', { length: 32 }).notNull(),
    valueB: doublePrecision('value_b').notNull(),
    relDiff: doublePrecision('rel_diff').notNull(),
    /** `selisih` (5-20%) atau `tinjau_manual` (> 20%). */
    severity: varchar('severity', { length: 16 }).notNull(),
    /** Sumber yang nilainya dipakai — selalu yang peringkatnya lebih tinggi. */
    chosenSource: varchar('chosen_source', { length: 32 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    note: text('note'),
  },
  (t) => [
    uniqueIndex('reconciliation_uq').on(t.instrumentId, t.period, t.item, t.sourceA, t.sourceB),
    index('reconciliation_open_idx').on(t.severity, t.resolvedAt),
  ],
)

// ---------------------------------------------------------------------------
// Backtest
// ---------------------------------------------------------------------------

/**
 * Satu kali jalan backtest beserta hasilnya.
 *
 * Disimpan, bukan dihitung ulang saat halaman dibuka. Backtest memakan menit,
 * dan angka yang muncul berbeda tiap kali halaman dimuat tidak bisa dipakai
 * siapa pun untuk mengambil keputusan.
 *
 * `trials` mencatat berapa kali percobaan sudah dilakukan. Menguji lima ratus
 * variasi lalu menampilkan yang terbaik adalah penambangan data, dan satu-satunya
 * cara menahannya adalah dengan menghitung percobaannya secara terbuka.
 */
export const backtestRun = pgTable(
  'backtest_run',
  {
    id: serial('id').primaryKey(),
    runAt: timestamp('run_at', { withTimezone: true }).notNull().defaultNow(),
    modelVersion: varchar('model_version', { length: 32 }).notNull(),
    featureSetVersion: varchar('feature_set_version', { length: 32 }).notNull(),
    market: marketEnum('market'),
    config: jsonb('config').$type<Record<string, unknown>>().notNull(),
    /** Metrik per horizon, beserta IC tiap fitur. */
    metrics: jsonb('metrics').$type<Record<string, unknown>>().notNull(),
    trials: integer('trials').notNull().default(1),
  },
  (t) => [index('backtest_run_at_idx').on(t.runAt)],
)

export type BacktestRunRow = typeof backtestRun.$inferSelect

// ---------------------------------------------------------------------------
// Berita & Intelijen Pasar AI
// ---------------------------------------------------------------------------

export const marketNews = pgTable(
  'market_news',
  {
    id: serial('id').primaryKey(),
    slug: varchar('slug', { length: 180 }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    summary: text('summary').notNull(),
    category: varchar('category', { length: 48 }).notNull().default('ekonomi-makro'),
    tags: jsonb('tags').$type<string[]>().notNull().default([]),
    mentionedSymbols: jsonb('mentioned_symbols').$type<string[]>().notNull().default([]),
    sentiment: varchar('sentiment', { length: 16 }).notNull().default('neutral'),
    impactScore: integer('impact_score').notNull().default(5),
    featuredImage: jsonb('featured_image').$type<{
      /** URL AVIF di bucket sendiri. Sampul tidak pernah menunjuk CDN pihak lain. */
      url: string
      caption?: string
      credit?: string
      alt: string
      /** Halaman sumber foto asli, ditautkan pada kredit demi kepatuhan lisensi. */
      sourceUrl?: string
      /** Kode lisensi foto, mis. "CC BY-SA 2.0". */
      license?: string
    } | null>(),
    youtubeVideo: jsonb('youtube_video').$type<{
      videoId: string
      title: string
      channel: string
      relevance?: string
    } | null>(),
    keyTakeaways: jsonb('key_takeaways').$type<string[]>().notNull().default([]),
    contentMarkdown: text('content_markdown').notNull(),
    author: varchar('author', { length: 64 }).notNull().default('AI Intelligence Desk'),
    readingTimeMinutes: integer('reading_time_minutes').notNull().default(3),
    viewsCount: integer('views_count').notNull().default(0),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('market_news_slug_uq').on(t.slug),
    index('market_news_category_idx').on(t.category),
    index('market_news_published_at_idx').on(t.publishedAt),
  ],
)

/**
 * Versi artikel warta dalam bahasa lain.
 *
 * Hanya teks yang berubah per bahasa yang disimpan di sini. Angka dampak,
 * simbol, sampul, dan tanggal tetap dibaca dari baris sumbernya, supaya kelima
 * versi tidak mungkin saling menyimpang soal fakta.
 */
export const marketNewsTranslation = pgTable(
  'market_news_translation',
  {
    newsId: integer('news_id')
      .notNull()
      .references(() => marketNews.id, { onDelete: 'cascade' }),
    locale: varchar('locale', { length: 8 }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    summary: text('summary').notNull(),
    tags: jsonb('tags').$type<string[]>().notNull().default([]),
    keyTakeaways: jsonb('key_takeaways').$type<string[]>().notNull().default([]),
    contentMarkdown: text('content_markdown').notNull(),
    imageAlt: text('image_alt'),
    imageCaption: text('image_caption'),
    /** Model yang menulis versi ini, untuk jejak audit. */
    model: varchar('model', { length: 96 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.newsId, t.locale] })],
)

export type MarketNewsTranslationRow = typeof marketNewsTranslation.$inferSelect

export type MarketNewsRow = typeof marketNews.$inferSelect
export type NewMarketNews = typeof marketNews.$inferInsert

// ---------------------------------------------------------------------------
// Manajemen Pengguna & Hak Akses (User vs Admin)
// ---------------------------------------------------------------------------

export const appUser = pgTable(
  'app_user',
  {
    id: serial('id').primaryKey(),
    email: varchar('email', { length: 128 }).notNull(),
    name: varchar('name', { length: 128 }).notNull().default('Analis Komite'),
    role: varchar('role', { length: 32 }).notNull().default('user'), // 'admin' | 'user'
    // Boleh kosong: akun yang dibuat manual lewat portal admin belum punya kata
    // sandi, dan akun tanpa kata sandi memang tidak bisa dipakai masuk sendiri.
    passwordHash: varchar('password_hash', { length: 255 }),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('app_user_email_uq').on(t.email),
    index('app_user_role_idx').on(t.role),
  ],
)

export type AppUserRow = typeof appUser.$inferSelect
export type NewAppUser = typeof appUser.$inferInsert

// ---------------------------------------------------------------------------
// Catatan Kunjungan (untuk peta sebaran pengunjung)
// ---------------------------------------------------------------------------

/**
 * Satu baris per muatan halaman.
 *
 * Tidak ada kolom alamat IP, dan itu disengaja — lihat catatan panjang di
 * `lib/analytics/geo.ts`. `visitorHash` adalah sidik ber-garam yang hanya bisa
 * menjawab "sama atau berbeda", bukan "siapa".
 */
export const visitLog = pgTable(
  'visit_log',
  {
    id: serial('id').primaryKey(),
    visitorHash: varchar('visitor_hash', { length: 32 }).notNull(),
    path: varchar('path', { length: 255 }).notNull(),
    country: varchar('country', { length: 4 }),
    region: varchar('region', { length: 64 }),
    city: varchar('city', { length: 128 }),
    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),
    deviceClass: varchar('device_class', { length: 16 }).notNull().default('unknown'),
    geoSource: varchar('geo_source', { length: 16 }).notNull().default('unknown'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('visit_log_created_at_idx').on(t.createdAt),
    index('visit_log_visitor_idx').on(t.visitorHash),
    index('visit_log_country_idx').on(t.country),
  ],
)

export type VisitLogRow = typeof visitLog.$inferSelect
export type NewVisitLog = typeof visitLog.$inferInsert

// ---------------------------------------------------------------------------
// Pengaturan Iklan & AdSense (4 Slot Strategis, Default Hidden)
// ---------------------------------------------------------------------------

export const adSettings = pgTable(
  'ad_settings',
  {
    id: serial('id').primaryKey(),
    slotName: varchar('slot_name', { length: 64 }).notNull(), // 'header_leaderboard' | 'in_article_mid' | 'sidebar_widget' | 'footer_banner'
    title: varchar('title', { length: 128 }).notNull(),
    description: text('description'),
    isEnabled: boolean('is_enabled').notNull().default(false), // WAJIB DEFAULT FALSE / HIDDEN
    adCodeHtml: text('ad_code_html'),
    targetUrl: text('target_url'),
    imageUrl: text('image_url'),
    sponsorName: varchar('sponsor_name', { length: 128 }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('ad_settings_slot_name_uq').on(t.slotName),
  ],
)

export type AdSettingsRow = typeof adSettings.$inferSelect
export type NewAdSettings = typeof adSettings.$inferInsert

