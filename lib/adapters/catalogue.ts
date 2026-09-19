/**
 * Katalog instrumen awal.
 *
 * Satu daftar untuk seluruh kelas aset, karena pertanyaan "apa saja yang
 * dilacak sistem ini" harus punya satu jawaban yang bisa dibaca, bukan tersebar
 * di beberapa berkas.
 *
 * Daftar ini keinginan, bukan kebenaran. Simbol bisa berganti nama, kontrak
 * berjangka bisa berpindah, dan bursa menghapus pasangan tanpa pemberitahuan.
 * Karena itu skrip seed memeriksa tiap simbol ke sumbernya lebih dulu dan
 * melaporkan mana yang tidak menjawab, alih-alih memasukkannya diam-diam lalu
 * membiarkannya gagal tiap hari di dalam log.
 */

import type { Market } from './types'
import type { AssetClass } from '@/lib/db/schema'

export interface CatalogueEntry {
  symbol: string
  name: string
  market: Market
  assetClass: AssetClass
  currency: string
  /** Negara atau kawasan, untuk mengelompokkan indeks di antarmuka. */
  region?: string
}

// ---------------------------------------------------------------------------
// Crypto — Binance
// ---------------------------------------------------------------------------

const CRYPTO: CatalogueEntry[] = [
  ['BTCUSDT', 'Bitcoin'],
  ['ETHUSDT', 'Ethereum'],
  ['BNBUSDT', 'BNB'],
  ['SOLUSDT', 'Solana'],
  ['XRPUSDT', 'XRP'],
  ['ADAUSDT', 'Cardano'],
  ['DOTUSDT', 'Polkadot'],
  ['AVAXUSDT', 'Avalanche'],
  ['POLUSDT', 'Polygon'],
  ['LINKUSDT', 'Chainlink'],
  ['DOGEUSDT', 'Dogecoin'],
  ['TRXUSDT', 'TRON'],
].map(([symbol, name]) => ({
  symbol,
  name,
  market: 'CRYPTO' as Market,
  assetClass: 'crypto' as AssetClass,
  currency: 'USDT',
}))

// ---------------------------------------------------------------------------
// Emas
// ---------------------------------------------------------------------------

/**
 * Emas didekati dari dua sisi yang sengaja dibiarkan berdampingan.
 *
 * Kontrak berjangka adalah harga acuan dunia dan berhenti di akhir pekan. Token
 * beragun emas berdagang terus tanpa jeda dan membawa risiko penerbitnya
 * sendiri. Keduanya melacak logam yang sama tetapi tidak pernah sama persis,
 * dan selisihnya sendiri adalah informasi.
 */
const EMAS: CatalogueEntry[] = [
  { symbol: 'GC=F', name: 'Emas berjangka', market: 'GLOBAL', assetClass: 'emas', currency: 'USD', region: 'Global' },
  { symbol: 'PAXGUSDT', name: 'PAX Gold', market: 'CRYPTO', assetClass: 'emas', currency: 'USDT', region: 'Global' },
  { symbol: 'XAUTUSDT', name: 'Tether Gold', market: 'CRYPTO', assetClass: 'emas', currency: 'USDT', region: 'Global' },
]

// ---------------------------------------------------------------------------
// Komoditi
// ---------------------------------------------------------------------------

const KOMODITI: CatalogueEntry[] = [
  ['SI=F', 'Perak berjangka'],
  ['HG=F', 'Tembaga berjangka'],
  ['PL=F', 'Platina berjangka'],
  ['CL=F', 'Minyak WTI'],
  ['BZ=F', 'Minyak Brent'],
  ['NG=F', 'Gas alam'],
  ['ZC=F', 'Jagung'],
  ['ZW=F', 'Gandum'],
  ['ZS=F', 'Kedelai'],
  ['KC=F', 'Kopi'],
  ['SB=F', 'Gula'],
  ['CT=F', 'Kapas'],
].map(([symbol, name]) => ({
  symbol,
  name,
  market: 'GLOBAL' as Market,
  assetClass: 'komoditi' as AssetClass,
  currency: 'USD',
  region: 'Global',
}))

// ---------------------------------------------------------------------------
// Saham
// ---------------------------------------------------------------------------

const SAHAM_IDX: CatalogueEntry[] = [
  ['BBCA.JK', 'Bank Central Asia'],
  ['BBRI.JK', 'Bank Rakyat Indonesia'],
  ['BMRI.JK', 'Bank Mandiri'],
  ['BBNI.JK', 'Bank Negara Indonesia'],
  ['TLKM.JK', 'Telkom Indonesia'],
  ['ASII.JK', 'Astra International'],
  ['UNVR.JK', 'Unilever Indonesia'],
  ['ICBP.JK', 'Indofood CBP'],
  ['KLBF.JK', 'Kalbe Farma'],
  ['ANTM.JK', 'Aneka Tambang'],
  ['ADRO.JK', 'Adaro Energy'],
  ['GOTO.JK', 'GoTo Gojek Tokopedia'],
].map(([symbol, name]) => ({
  symbol,
  name,
  market: 'IDX' as Market,
  assetClass: 'saham' as AssetClass,
  currency: 'IDR',
  region: 'Indonesia',
}))

const SAHAM_US: CatalogueEntry[] = ([
  // Sekitar seratus emiten berkapitalisasi terbesar. Delapan tidak cukup untuk
  // menguji normalisasi sektor: persentil valuasi butuh penampang lintang.
  ['AAPL', 'Apple'],
  ['MSFT', 'Microsoft'],
  ['NVDA', 'NVIDIA'],
  ['GOOGL', 'Alphabet'],
  ['AMZN', 'Amazon'],
  ['META', 'Meta Platforms'],
  ['TSLA', 'Tesla'],
  ['AVGO', 'Broadcom'],
  ['BRK-B', 'Berkshire Hathaway'],
  ['LLY', 'Eli Lilly'],
  ['JPM', 'JPMorgan Chase'],
  ['V', 'Visa'],
  ['MA', 'Mastercard'],
  ['XOM', 'Exxon Mobil'],
  ['UNH', 'UnitedHealth'],
  ['JNJ', 'Johnson & Johnson'],
  ['PG', 'Procter & Gamble'],
  ['COST', 'Costco'],
  ['HD', 'Home Depot'],
  ['ABBV', 'AbbVie'],
  ['WMT', 'Walmart'],
  ['MRK', 'Merck'],
  ['NFLX', 'Netflix'],
  ['KO', 'Coca-Cola'],
  ['PEP', 'PepsiCo'],
  ['ADBE', 'Adobe'],
  ['CRM', 'Salesforce'],
  ['ORCL', 'Oracle'],
  ['AMD', 'AMD'],
  ['CSCO', 'Cisco'],
  ['ACN', 'Accenture'],
  ['MCD', "McDonald's"],
  ['TMO', 'Thermo Fisher'],
  ['ABT', 'Abbott'],
  ['LIN', 'Linde'],
  ['CVX', 'Chevron'],
  ['INTC', 'Intel'],
  ['QCOM', 'Qualcomm'],
  ['TXN', 'Texas Instruments'],
  ['INTU', 'Intuit'],
  ['IBM', 'IBM'],
  ['GE', 'General Electric'],
  ['CAT', 'Caterpillar'],
  ['BA', 'Boeing'],
  ['HON', 'Honeywell'],
  ['UPS', 'UPS'],
  ['RTX', 'RTX'],
  ['LMT', 'Lockheed Martin'],
  ['DE', 'Deere'],
  ['NKE', 'Nike'],
  ['SBUX', 'Starbucks'],
  ['LOW', "Lowe's"],
  ['TGT', 'Target'],
  ['DIS', 'Disney'],
  ['CMCSA', 'Comcast'],
  ['VZ', 'Verizon'],
  ['T', 'AT&T'],
  ['TMUS', 'T-Mobile'],
  ['BAC', 'Bank of America'],
  ['WFC', 'Wells Fargo'],
  ['C', 'Citigroup'],
  ['GS', 'Goldman Sachs'],
  ['MS', 'Morgan Stanley'],
  ['AXP', 'American Express'],
  ['BLK', 'BlackRock'],
  ['SCHW', 'Charles Schwab'],
  ['PNC', 'PNC Financial'],
  ['USB', 'U.S. Bancorp'],
  ['PFE', 'Pfizer'],
  ['BMY', 'Bristol-Myers Squibb'],
  ['AMGN', 'Amgen'],
  ['GILD', 'Gilead Sciences'],
  ['CVS', 'CVS Health'],
  ['MDT', 'Medtronic'],
  ['DHR', 'Danaher'],
  ['ISRG', 'Intuitive Surgical'],
  ['SYK', 'Stryker'],
  ['BSX', 'Boston Scientific'],
  ['VRTX', 'Vertex'],
  ['REGN', 'Regeneron'],
  ['MU', 'Micron'],
  ['AMAT', 'Applied Materials'],
  ['LRCX', 'Lam Research'],
  ['KLAC', 'KLA'],
  ['ADI', 'Analog Devices'],
  ['NOW', 'ServiceNow'],
  ['PANW', 'Palo Alto Networks'],
  ['SNPS', 'Synopsys'],
  ['CDNS', 'Cadence'],
  ['UBER', 'Uber'],
  ['ABNB', 'Airbnb'],
  ['PYPL', 'PayPal'],
  ['SPGI', 'S&P Global'],
  ['CME', 'CME Group'],
  ['ICE', 'Intercontinental Exchange'],
  ['MMM', '3M'],
  ['COP', 'ConocoPhillips'],
  ['SLB', 'SLB'],
  ['EOG', 'EOG Resources'],
  ['NEE', 'NextEra Energy'],
  ['DUK', 'Duke Energy'],
  ['SO', 'Southern Company'],
  ['PLD', 'Prologis'],
  ['AMT', 'American Tower'],
  ['MO', 'Altria'],
  ['MDLZ', 'Mondelez'],
  ['CL', 'Colgate-Palmolive'],
  ['KMB', 'Kimberly-Clark'],
] as [string, string][]).map(([symbol, name]) => ({
  symbol,
  name,
  market: 'US' as Market,
  assetClass: 'saham' as AssetClass,
  currency: 'USD',
  region: 'Amerika Serikat',
}))

// ---------------------------------------------------------------------------
// Indeks
// ---------------------------------------------------------------------------

/**
 * Indeks dunia, bukan hanya Indonesia dan Amerika.
 *
 * Dua alasan. Pertama, IHSG tidak bergerak sendirian: arah bursa Asia semalam
 * sebelumnya sering menjelaskan pembukaannya. Kedua, kekuatan relatif hanya
 * berarti bila ada pembandingnya, dan tiap saham dibandingkan terhadap indeks
 * pasarnya sendiri, bukan terhadap indeks negara lain.
 */
const INDEKS: CatalogueEntry[] = [
  ['^JKSE', 'IHSG', 'IDR', 'Indonesia'],
  ['^GSPC', 'S&P 500', 'USD', 'Amerika Serikat'],
  ['^IXIC', 'Nasdaq Composite', 'USD', 'Amerika Serikat'],
  ['^DJI', 'Dow Jones', 'USD', 'Amerika Serikat'],
  ['^RUT', 'Russell 2000', 'USD', 'Amerika Serikat'],
  ['^VIX', 'VIX', 'USD', 'Amerika Serikat'],
  ['^N225', 'Nikkei 225', 'JPY', 'Jepang'],
  ['^HSI', 'Hang Seng', 'HKD', 'Hong Kong'],
  ['000001.SS', 'Shanghai Composite', 'CNY', 'China'],
  ['^STI', 'Straits Times', 'SGD', 'Singapura'],
  ['^KLSE', 'FTSE Bursa Malaysia KLCI', 'MYR', 'Malaysia'],
  ['^SET.BK', 'SET Index', 'THB', 'Thailand'],
  ['^KS11', 'KOSPI', 'KRW', 'Korea Selatan'],
  ['^TWII', 'TAIEX', 'TWD', 'Taiwan'],
  ['^NSEI', 'Nifty 50', 'INR', 'India'],
  ['^BSESN', 'Sensex', 'INR', 'India'],
  ['^AXJO', 'ASX 200', 'AUD', 'Australia'],
  ['^FTSE', 'FTSE 100', 'GBP', 'Inggris'],
  ['^GDAXI', 'DAX', 'EUR', 'Jerman'],
  ['^FCHI', 'CAC 40', 'EUR', 'Prancis'],
  ['^STOXX50E', 'Euro Stoxx 50', 'EUR', 'Zona Euro'],
  ['^BVSP', 'Bovespa', 'BRL', 'Brasil'],
  ['DX-Y.NYB', 'Indeks Dolar AS', 'USD', 'Global'],
].map(([symbol, name, currency, region]) => ({
  symbol,
  name,
  market: 'GLOBAL' as Market,
  assetClass: 'indeks' as AssetClass,
  currency,
  region,
}))

export const CATALOGUE: CatalogueEntry[] = [
  ...CRYPTO,
  ...EMAS,
  ...KOMODITI,
  ...SAHAM_IDX,
  ...SAHAM_US,
  ...INDEKS,
]

export function catalogueFor(market: Market): CatalogueEntry[] {
  return CATALOGUE.filter((entry) => entry.market === market)
}

/** Dipakai worker untuk mengisi nama dan kelas aset saat instrumen belum terdaftar. */
export function catalogueEntry(market: Market, symbol: string): CatalogueEntry | undefined {
  return CATALOGUE.find((entry) => entry.market === market && entry.symbol === symbol)
}
