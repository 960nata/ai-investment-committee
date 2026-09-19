/**
 * Pos kanonik laporan keuangan, dan pemetaannya dari tiap sumber.
 *
 * Daftar sinonim di bawah bukan kelebihan, melainkan keharusan. Perusahaan
 * berbeda memakai elemen taksonomi berbeda untuk konsep yang sama: satu memakai
 * `Revenues`, satu lagi `RevenueFromContractWithCustomerExcludingAssessedTax`.
 * Parser yang hanya mengenali satu nama akan mengembalikan kosong untuk
 * sebagian besar emiten, dan kekosongan itu terlihat seperti data yang memang
 * tidak ada.
 *
 * `notApplicableTo` mencegah pos yang memang tidak pernah ada pada jenis usaha
 * tertentu dicari terus lalu dicatat sebagai data hilang. Bank tidak punya
 * "persediaan", dan menghitungnya sebagai kekurangan akan menurunkan confidence
 * seluruh sektor perbankan tanpa satu pun alasan yang benar.
 */

export type ItemGroup = 'laba_rugi' | 'neraca' | 'arus_kas'

export interface ItemSpec {
  /** Nama kanonik, dipakai di seluruh sistem apa pun sumbernya. */
  name: string
  group: ItemGroup
  label: string
  /** Fakta berdurasi (laba rugi, arus kas) atau fakta sesaat (neraca). */
  kind: 'durasi' | 'sesaat'
  /** Ikut dihitung dalam kelengkapan. Pos pelengkap tidak. */
  required: boolean
  /** Elemen us-gaap, berurutan prioritas. Yang pertama ditemukan dipakai. */
  usGaap: string[]
  notApplicableTo?: ('bank' | 'asuransi')[]
}

export const ITEMS: ItemSpec[] = [
  // --- laba rugi ------------------------------------------------------------
  {
    name: 'pendapatan',
    group: 'laba_rugi',
    label: 'Pendapatan',
    kind: 'durasi',
    required: true,
    usGaap: [
      'RevenueFromContractWithCustomerExcludingAssessedTax',
      'RevenueFromContractWithCustomerIncludingAssessedTax',
      'Revenues',
      'SalesRevenueNet',
      'SalesRevenueGoodsNet',
    ],
  },
  {
    name: 'laba_kotor',
    group: 'laba_rugi',
    label: 'Laba kotor',
    kind: 'durasi',
    required: true,
    usGaap: ['GrossProfit'],
    notApplicableTo: ['bank'],
  },
  {
    name: 'laba_operasi',
    group: 'laba_rugi',
    label: 'Laba operasi',
    kind: 'durasi',
    required: true,
    usGaap: ['OperatingIncomeLoss'],
  },
  {
    name: 'laba_sebelum_pajak',
    group: 'laba_rugi',
    label: 'Laba sebelum pajak',
    kind: 'durasi',
    required: true,
    usGaap: [
      'IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest',
      'IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments',
    ],
  },
  {
    name: 'beban_pajak',
    group: 'laba_rugi',
    label: 'Beban pajak',
    kind: 'durasi',
    required: true,
    usGaap: ['IncomeTaxExpenseBenefit'],
  },
  {
    name: 'beban_bunga',
    group: 'laba_rugi',
    label: 'Beban bunga',
    kind: 'durasi',
    required: false,
    usGaap: ['InterestExpense', 'InterestExpenseDebt', 'InterestIncomeExpenseNet'],
  },
  {
    name: 'laba_bersih',
    group: 'laba_rugi',
    label: 'Laba bersih',
    kind: 'durasi',
    required: true,
    usGaap: ['NetIncomeLoss', 'ProfitLoss'],
  },
  {
    name: 'eps_dilusian',
    group: 'laba_rugi',
    label: 'Laba per saham dilusian',
    kind: 'durasi',
    required: false,
    usGaap: ['EarningsPerShareDiluted'],
  },

  // --- neraca ---------------------------------------------------------------
  {
    name: 'total_aset',
    group: 'neraca',
    label: 'Total aset',
    kind: 'sesaat',
    required: true,
    usGaap: ['Assets'],
  },
  {
    name: 'aset_lancar',
    group: 'neraca',
    label: 'Aset lancar',
    kind: 'sesaat',
    required: true,
    usGaap: ['AssetsCurrent'],
    notApplicableTo: ['bank'],
  },
  {
    name: 'kas',
    group: 'neraca',
    label: 'Kas dan setara kas',
    kind: 'sesaat',
    required: true,
    usGaap: [
      'CashAndCashEquivalentsAtCarryingValue',
      'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents',
    ],
  },
  {
    name: 'persediaan',
    group: 'neraca',
    label: 'Persediaan',
    kind: 'sesaat',
    required: false,
    usGaap: ['InventoryNet'],
    notApplicableTo: ['bank'],
  },
  {
    name: 'aset_tetap',
    group: 'neraca',
    label: 'Aset tetap bersih',
    kind: 'sesaat',
    required: false,
    usGaap: ['PropertyPlantAndEquipmentNet'],
  },
  {
    name: 'total_liabilitas',
    group: 'neraca',
    label: 'Total liabilitas',
    kind: 'sesaat',
    required: true,
    usGaap: ['Liabilities'],
  },
  {
    name: 'liabilitas_lancar',
    group: 'neraca',
    label: 'Liabilitas lancar',
    kind: 'sesaat',
    required: true,
    usGaap: ['LiabilitiesCurrent'],
    notApplicableTo: ['bank'],
  },
  {
    name: 'utang_jangka_panjang',
    group: 'neraca',
    label: 'Utang jangka panjang',
    kind: 'sesaat',
    required: false,
    usGaap: ['LongTermDebtNoncurrent', 'LongTermDebt'],
  },
  {
    name: 'ekuitas',
    group: 'neraca',
    label: 'Ekuitas',
    kind: 'sesaat',
    required: true,
    usGaap: [
      'StockholdersEquity',
      'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest',
    ],
  },
  {
    name: 'laba_ditahan',
    group: 'neraca',
    label: 'Laba ditahan',
    kind: 'sesaat',
    required: true,
    usGaap: ['RetainedEarningsAccumulatedDeficit'],
  },
  {
    name: 'saham_beredar',
    group: 'neraca',
    label: 'Saham beredar',
    kind: 'sesaat',
    required: true,
    usGaap: [
      'CommonStockSharesOutstanding',
      'WeightedAverageNumberOfDilutedSharesOutstanding',
      'WeightedAverageNumberOfSharesOutstandingBasic',
    ],
  },

  // --- arus kas -------------------------------------------------------------
  {
    name: 'arus_kas_operasi',
    group: 'arus_kas',
    label: 'Arus kas operasi',
    kind: 'durasi',
    required: true,
    // Pos yang paling sering hilang di sumber gratis, dan tanpanya tidak ada
    // rumus akrual, tidak ada Piotroski kriteria empat, tidak ada arus kas bebas.
    usGaap: [
      'NetCashProvidedByUsedInOperatingActivities',
      'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations',
    ],
  },
  {
    name: 'belanja_modal',
    group: 'arus_kas',
    label: 'Belanja modal',
    kind: 'durasi',
    required: true,
    usGaap: [
      'PaymentsToAcquirePropertyPlantAndEquipment',
      'PaymentsToAcquireProductiveAssets',
    ],
  },
  {
    name: 'dividen_dibayar',
    group: 'arus_kas',
    label: 'Dividen dibayar',
    kind: 'durasi',
    required: false,
    usGaap: ['PaymentsOfDividendsCommonStock', 'PaymentsOfDividends'],
  },
  {
    name: 'pembelian_kembali_saham',
    group: 'arus_kas',
    label: 'Pembelian kembali saham',
    kind: 'durasi',
    required: false,
    usGaap: ['PaymentsForRepurchaseOfCommonStock'],
  },
  {
    name: 'penyusutan',
    group: 'arus_kas',
    label: 'Penyusutan dan amortisasi',
    kind: 'durasi',
    required: false,
    usGaap: [
      'DepreciationDepletionAndAmortization',
      'DepreciationAmortizationAndAccretionNet',
      'Depreciation',
    ],
  },
]

export const REQUIRED_ITEMS = ITEMS.filter((i) => i.required).map((i) => i.name)

export function itemByName(name: string): ItemSpec | undefined {
  return ITEMS.find((i) => i.name === name)
}

/** Pos wajib yang berlaku untuk jenis usaha tertentu. */
export function requiredFor(kind: 'umum' | 'bank'): string[] {
  return ITEMS.filter(
    (i) => i.required && !(kind === 'bank' && i.notApplicableTo?.includes('bank')),
  ).map((i) => i.name)
}
