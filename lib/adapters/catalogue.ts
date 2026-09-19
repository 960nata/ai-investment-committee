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

const CRYPTO: CatalogueEntry[] = ([
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
  ['TRXUSDT', 'TRON'],
  ['LTCUSDT', 'Litecoin'],
  ['BCHUSDT', 'Bitcoin Cash'],
  ['ATOMUSDT', 'Cosmos'],
  ['NEARUSDT', 'NEAR Protocol'],
  ['APTUSDT', 'Aptos'],
  ['ARBUSDT', 'Arbitrum'],
  ['OPUSDT', 'Optimism'],
  ['FILUSDT', 'Filecoin'],
  ['ICPUSDT', 'Internet Computer'],
  ['INJUSDT', 'Injective'],
  ['SUIUSDT', 'Sui'],
  ['SEIUSDT', 'Sei'],
  ['TIAUSDT', 'Celestia'],
  ['GRTUSDT', 'The Graph'],
  ['AAVEUSDT', 'Aave'],
  ['UNIUSDT', 'Uniswap'],
  ['LDOUSDT', 'Lido DAO'],
  ['STXUSDT', 'Stacks'],
  ['ALGOUSDT', 'Algorand'],
  ['VETUSDT', 'VeChain'],
  ['HBARUSDT', 'Hedera'],
  ['XLMUSDT', 'Stellar'],
  ['ETCUSDT', 'Ethereum Classic'],
  ['RENDERUSDT', 'Render'],
  ['FETUSDT', 'Artificial Superintelligence'],
] as [string, string][]).map(([symbol, name]) => ({
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
// ---------------------------------------------------------------------------
// Koin meme
// ---------------------------------------------------------------------------

/**
 * Dipisah dari crypto dengan sengaja.
 *
 * Koin meme tidak punya pendapatan, jadwal unlock yang bermakna, maupun
 * aktivitas jaringan yang menjelaskan harganya. Yang menggerakkannya perhatian
 * orang, dan itu jenis risiko yang berbeda — bukan lebih buruk, tetapi tidak
 * bisa dinilai dengan pertanyaan yang sama. Menaruhnya satu tab dengan Bitcoin
 * membuat keduanya terlihat setara, dan itu yang paling menyesatkan.
 */
const MEMECOIN: CatalogueEntry[] = ([
  ['DOGEUSDT', 'Dogecoin'],
  ['SHIBUSDT', 'Shiba Inu'],
  ['PEPEUSDT', 'Pepe'],
  ['WIFUSDT', 'dogwifhat'],
  ['BONKUSDT', 'Bonk'],
  ['FLOKIUSDT', 'Floki'],
  ['BOMEUSDT', 'Book of Meme'],
  ['MEMEUSDT', 'Memecoin'],
  ['NEIROUSDT', 'Neiro'],
  ['TURBOUSDT', 'Turbo'],
  ['1000SATSUSDT', 'SATS'],
  ['ORDIUSDT', 'ORDI'],
  ['PENGUUSDT', 'Pudgy Penguins'],
  ['ACTUSDT', 'Act I The AI Prophecy'],
] as [string, string][]).map(([symbol, name]) => ({
  symbol,
  name,
  market: 'CRYPTO' as Market,
  assetClass: 'memecoin' as AssetClass,
  currency: 'USDT',
}))

const EMAS: CatalogueEntry[] = [
  { symbol: 'GC=F', name: 'Emas berjangka', market: 'GLOBAL', assetClass: 'emas', currency: 'USD', region: 'Global' },
  { symbol: 'PAXGUSDT', name: 'PAX Gold', market: 'CRYPTO', assetClass: 'emas', currency: 'USDT', region: 'Global' },
  { symbol: 'XAUTUSDT', name: 'Tether Gold', market: 'CRYPTO', assetClass: 'emas', currency: 'USDT', region: 'Global' },
]

// ---------------------------------------------------------------------------
// Komoditi
// ---------------------------------------------------------------------------

const KOMODITI: CatalogueEntry[] = ([
  ['SI=F', 'Perak berjangka'],
  ['HG=F', 'Tembaga berjangka'],
  ['PL=F', 'Platina berjangka'],
  ['PA=F', 'Paladium berjangka'],
  ['CL=F', 'Minyak WTI'],
  ['BZ=F', 'Minyak Brent'],
  ['NG=F', 'Gas alam'],
  ['RB=F', 'Bensin RBOB'],
  ['HO=F', 'Minyak pemanas'],
  ['ZC=F', 'Jagung'],
  ['ZW=F', 'Gandum'],
  ['ZS=F', 'Kedelai'],
  ['ZL=F', 'Minyak kedelai'],
  ['ZM=F', 'Bungkil kedelai'],
  ['ZO=F', 'Gandum oat'],
  ['ZR=F', 'Beras'],
  ['KC=F', 'Kopi'],
  ['SB=F', 'Gula'],
  ['CC=F', 'Kakao'],
  ['CT=F', 'Kapas'],
  ['OJ=F', 'Jus jeruk'],
  ['LE=F', 'Sapi hidup'],
  ['HE=F', 'Babi kurus'],
  ['LBS=F', 'Kayu'],
] as [string, string][]).map(([symbol, name]) => ({
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
  ['AMRT.JK', 'Sumber Alfaria Trijaya'],
  ['INDF.JK', 'Indofood Sukses Makmur'],
  ['CPIN.JK', 'Charoen Pokphand Indonesia'],
  ['UNTR.JK', 'United Tractors'],
  ['PGAS.JK', 'Perusahaan Gas Negara'],
  ['PTBA.JK', 'Bukit Asam'],
  ['INCO.JK', 'Vale Indonesia'],
  ['MDKA.JK', 'Merdeka Copper Gold'],
  ['SMGR.JK', 'Semen Indonesia'],
  ['INTP.JK', 'Indocement Tunggal Prakarsa'],
  ['JPFA.JK', 'Japfa Comfeed Indonesia'],
  ['MYOR.JK', 'Mayora Indah'],
  ['TOWR.JK', 'Sarana Menara Nusantara'],
  ['TBIG.JK', 'Tower Bersama Infrastructure'],
  ['EXCL.JK', 'XL Axiata'],
  ['ISAT.JK', 'Indosat Ooredoo Hutchison'],
  ['BRIS.JK', 'Bank Syariah Indonesia'],
  ['BBTN.JK', 'Bank Tabungan Negara'],
  ['ARTO.JK', 'Bank Jago'],
  ['BUKA.JK', 'Bukalapak'],
  ['EMTK.JK', 'Elang Mahkota Teknologi'],
  ['MNCN.JK', 'Media Nusantara Citra'],
  ['SCMA.JK', 'Surya Citra Media'],
  ['ACES.JK', 'Aspirasi Hidup Indonesia'],
  ['ERAA.JK', 'Erajaya Swasembada'],
  ['MAPI.JK', 'Mitra Adiperkasa'],
  ['SIDO.JK', 'Industri Jamu Sido Muncul'],
  ['KAEF.JK', 'Kimia Farma'],
  ['INKP.JK', 'Indah Kiat Pulp & Paper'],
  ['TKIM.JK', 'Pabrik Kertas Tjiwi Kimia'],
  ['BRPT.JK', 'Barito Pacific'],
  ['TPIA.JK', 'Chandra Asri Pacific'],
  ['MEDC.JK', 'Medco Energi Internasional'],
  ['HRUM.JK', 'Harum Energy'],
  ['ITMG.JK', 'Indo Tambangraya Megah'],
  ['AKRA.JK', 'AKR Corporindo'],
  ['CTRA.JK', 'Ciputra Development'],
  ['BSDE.JK', 'Bumi Serpong Damai'],
  ['PWON.JK', 'Pakuwon Jati'],
  ['SMRA.JK', 'Summarecon Agung'],
  ['JSMR.JK', 'Jasa Marga'],
  ['WIKA.JK', 'Wijaya Karya'],
  ['PTPP.JK', 'PP'],
  ['ADHI.JK', 'Adhi Karya'],
  ['GGRM.JK', 'Gudang Garam'],
  ['HMSP.JK', 'HM Sampoerna'],
  ['AALI.JK', 'Astra Agro Lestari'],
  ['LSIP.JK', 'PP London Sumatra Indonesia'],
  ['DSNG.JK', 'Dharma Satya Nusantara'],
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
// Saham internasional di luar Amerika
// ---------------------------------------------------------------------------

/**
 * Bursa di luar AS ditulis sebagai satu daftar berlabel negara, bukan satu
 * konstanta per negara. Yang membedakan mereka cuma akhiran simbol dan zona
 * waktunya; memecahnya jadi sepuluh konstanta hanya menambah tempat untuk lupa
 * memasukkan salah satunya ke katalog akhir.
 *
 * Akhiran Yahoo menentukan bursanya: .T Tokyo, .HK Hong Kong, .L London,
 * .DE Xetra, .PA Paris, .AS Amsterdam, .SW Swiss, .MI Milan, .KS Korea,
 * .NS India, .AX Australia, .SI Singapura, .TW Taiwan.
 */
const SAHAM_INTERNASIONAL: CatalogueEntry[] = ([
  ['7203.T', 'Toyota Motor', 'JPY', 'Jepang'],
  ['6758.T', 'Sony Group', 'JPY', 'Jepang'],
  ['6861.T', 'Keyence', 'JPY', 'Jepang'],
  ['8306.T', 'Mitsubishi UFJ Financial', 'JPY', 'Jepang'],
  ['9984.T', 'SoftBank Group', 'JPY', 'Jepang'],
  ['7267.T', 'Honda Motor', 'JPY', 'Jepang'],
  ['4063.T', 'Shin-Etsu Chemical', 'JPY', 'Jepang'],
  ['9432.T', 'Nippon Telegraph & Telephone', 'JPY', 'Jepang'],
  ['8035.T', 'Tokyo Electron', 'JPY', 'Jepang'],
  ['6501.T', 'Hitachi', 'JPY', 'Jepang'],
  ['7974.T', 'Nintendo', 'JPY', 'Jepang'],
  ['4502.T', 'Takeda Pharmaceutical', 'JPY', 'Jepang'],
  ['8058.T', 'Mitsubishi Corporation', 'JPY', 'Jepang'],
  ['6098.T', 'Recruit Holdings', 'JPY', 'Jepang'],

  ['0700.HK', 'Tencent Holdings', 'HKD', 'Hong Kong'],
  ['9988.HK', 'Alibaba Group', 'HKD', 'Hong Kong'],
  ['0941.HK', 'China Mobile', 'HKD', 'Hong Kong'],
  ['1299.HK', 'AIA Group', 'HKD', 'Hong Kong'],
  ['3690.HK', 'Meituan', 'HKD', 'Hong Kong'],
  ['0388.HK', 'Hong Kong Exchanges', 'HKD', 'Hong Kong'],
  ['1810.HK', 'Xiaomi', 'HKD', 'Hong Kong'],
  ['2318.HK', 'Ping An Insurance', 'HKD', 'Hong Kong'],
  ['0005.HK', 'HSBC Holdings', 'HKD', 'Hong Kong'],
  ['1398.HK', 'ICBC', 'HKD', 'Hong Kong'],
  ['0939.HK', 'China Construction Bank', 'HKD', 'Hong Kong'],
  ['9618.HK', 'JD.com', 'HKD', 'Hong Kong'],
  ['0883.HK', 'CNOOC', 'HKD', 'Hong Kong'],

  ['SHEL.L', 'Shell', 'GBP', 'Inggris'],
  ['AZN.L', 'AstraZeneca', 'GBP', 'Inggris'],
  ['HSBA.L', 'HSBC', 'GBP', 'Inggris'],
  ['ULVR.L', 'Unilever', 'GBP', 'Inggris'],
  ['BP.L', 'BP', 'GBP', 'Inggris'],
  ['GSK.L', 'GSK', 'GBP', 'Inggris'],
  ['RIO.L', 'Rio Tinto', 'GBP', 'Inggris'],
  ['BATS.L', 'British American Tobacco', 'GBP', 'Inggris'],
  ['DGE.L', 'Diageo', 'GBP', 'Inggris'],

  ['SAP.DE', 'SAP', 'EUR', 'Jerman'],
  ['SIE.DE', 'Siemens', 'EUR', 'Jerman'],
  ['ALV.DE', 'Allianz', 'EUR', 'Jerman'],
  ['DTE.DE', 'Deutsche Telekom', 'EUR', 'Jerman'],
  ['MBG.DE', 'Mercedes-Benz Group', 'EUR', 'Jerman'],
  ['BMW.DE', 'BMW', 'EUR', 'Jerman'],
  ['BAS.DE', 'BASF', 'EUR', 'Jerman'],
  ['BAYN.DE', 'Bayer', 'EUR', 'Jerman'],

  ['MC.PA', 'LVMH', 'EUR', 'Prancis'],
  ['OR.PA', "L'Oreal", 'EUR', 'Prancis'],
  ['TTE.PA', 'TotalEnergies', 'EUR', 'Prancis'],
  ['SAN.PA', 'Sanofi', 'EUR', 'Prancis'],
  ['AIR.PA', 'Airbus', 'EUR', 'Prancis'],
  ['SU.PA', 'Schneider Electric', 'EUR', 'Prancis'],
  ['BNP.PA', 'BNP Paribas', 'EUR', 'Prancis'],
  ['AI.PA', 'Air Liquide', 'EUR', 'Prancis'],

  ['ASML.AS', 'ASML Holding', 'EUR', 'Belanda'],
  ['INGA.AS', 'ING Groep', 'EUR', 'Belanda'],
  ['AD.AS', 'Ahold Delhaize', 'EUR', 'Belanda'],
  ['HEIA.AS', 'Heineken', 'EUR', 'Belanda'],
  ['PHIA.AS', 'Philips', 'EUR', 'Belanda'],

  ['NESN.SW', 'Nestle', 'CHF', 'Swiss'],
  ['ROG.SW', 'Roche', 'CHF', 'Swiss'],
  ['NOVN.SW', 'Novartis', 'CHF', 'Swiss'],
  ['UBSG.SW', 'UBS Group', 'CHF', 'Swiss'],
  ['ZURN.SW', 'Zurich Insurance', 'CHF', 'Swiss'],

  ['ENI.MI', 'Eni', 'EUR', 'Italia'],
  ['ISP.MI', 'Intesa Sanpaolo', 'EUR', 'Italia'],
  ['UCG.MI', 'UniCredit', 'EUR', 'Italia'],
  ['ENEL.MI', 'Enel', 'EUR', 'Italia'],

  ['005930.KS', 'Samsung Electronics', 'KRW', 'Korea Selatan'],
  ['000660.KS', 'SK Hynix', 'KRW', 'Korea Selatan'],
  ['005380.KS', 'Hyundai Motor', 'KRW', 'Korea Selatan'],
  ['051910.KS', 'LG Chem', 'KRW', 'Korea Selatan'],
  ['035420.KS', 'NAVER', 'KRW', 'Korea Selatan'],
  ['207940.KS', 'Samsung Biologics', 'KRW', 'Korea Selatan'],
  ['005490.KS', 'POSCO Holdings', 'KRW', 'Korea Selatan'],
  ['035720.KS', 'Kakao', 'KRW', 'Korea Selatan'],

  ['2330.TW', 'TSMC', 'TWD', 'Taiwan'],
  ['2317.TW', 'Hon Hai Precision', 'TWD', 'Taiwan'],
  ['2454.TW', 'MediaTek', 'TWD', 'Taiwan'],

  ['RELIANCE.NS', 'Reliance Industries', 'INR', 'India'],
  ['TCS.NS', 'Tata Consultancy Services', 'INR', 'India'],
  ['HDFCBANK.NS', 'HDFC Bank', 'INR', 'India'],
  ['INFY.NS', 'Infosys', 'INR', 'India'],
  ['ICICIBANK.NS', 'ICICI Bank', 'INR', 'India'],
  ['HINDUNILVR.NS', 'Hindustan Unilever', 'INR', 'India'],
  ['BHARTIARTL.NS', 'Bharti Airtel', 'INR', 'India'],
  ['ITC.NS', 'ITC', 'INR', 'India'],
  ['SBIN.NS', 'State Bank of India', 'INR', 'India'],
  ['LT.NS', 'Larsen & Toubro', 'INR', 'India'],

  ['BHP.AX', 'BHP Group', 'AUD', 'Australia'],
  ['CBA.AX', 'Commonwealth Bank', 'AUD', 'Australia'],
  ['CSL.AX', 'CSL', 'AUD', 'Australia'],
  ['NAB.AX', 'National Australia Bank', 'AUD', 'Australia'],
  ['WBC.AX', 'Westpac Banking', 'AUD', 'Australia'],
  ['ANZ.AX', 'ANZ Group', 'AUD', 'Australia'],
  ['WES.AX', 'Wesfarmers', 'AUD', 'Australia'],
  ['MQG.AX', 'Macquarie Group', 'AUD', 'Australia'],

  ['D05.SI', 'DBS Group', 'SGD', 'Singapura'],
  ['O39.SI', 'OCBC', 'SGD', 'Singapura'],
  ['U11.SI', 'United Overseas Bank', 'SGD', 'Singapura'],
  ['Z74.SI', 'Singtel', 'SGD', 'Singapura'],
  ['C6L.SI', 'Singapore Airlines', 'SGD', 'Singapura'],
] as [string, string, string, string][]).map(([symbol, name, currency, region]) => ({
  symbol,
  name,
  market: 'GLOBAL' as Market,
  assetClass: 'saham' as AssetClass,
  currency,
  region,
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
  ...MEMECOIN,
  ...EMAS,
  ...KOMODITI,
  ...SAHAM_IDX,
  ...SAHAM_US,
  ...SAHAM_INTERNASIONAL,
  ...INDEKS,
]

export function catalogueFor(market: Market): CatalogueEntry[] {
  return CATALOGUE.filter((entry) => entry.market === market)
}

/** Dipakai worker untuk mengisi nama dan kelas aset saat instrumen belum terdaftar. */
export function catalogueEntry(market: Market, symbol: string): CatalogueEntry | undefined {
  return CATALOGUE.find((entry) => entry.market === market && entry.symbol === symbol)
}
