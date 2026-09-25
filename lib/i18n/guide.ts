import type { Locale } from './locales'

/**
 * Isi halaman panduan pengguna, per bahasa.
 *
 * Ditulis untuk orang yang belum pernah berinvestasi: kalimat pendek, satu
 * gagasan per slide, tanpa istilah yang tidak dijelaskan. Kalau sebuah slide
 * butuh kata seperti "SMA200", kata itu muncul di gambar sebagai contoh, bukan
 * di kalimat yang harus dipahami.
 *
 * Tiap bahasa ditulis ulang agar terdengar wajar di bahasanya, bukan
 * diterjemahkan kata per kata. Yang tidak boleh berbeda antar bahasa: isinya.
 */

export type SlideArt =
  | 'hello'
  | 'noise'
  | 'prices'
  | 'formula'
  | 'debate'
  | 'reading'
  | 'unknown'
  | 'steps'
  | 'promise'

export interface GuideSlide {
  art: SlideArt
  kicker: string
  title: string
  body: string
  /** Label kecil di dalam gambar, bila gambarnya butuh teks. */
  labels?: string[]
}

export interface GuideContent {
  metaTitle: string
  metaDescription: string
  deckLabel: string
  prev: string
  next: string
  slideOf: (n: number, total: number) => string
  hint: string
  ctaPrimary: string
  ctaSecondary: string
  slides: GuideSlide[]
}

export const GUIDE: Record<Locale, GuideContent> = {
  id: {
    metaTitle: 'Panduan pengguna — Komite dalam 9 slide',
    metaDescription:
      'Penjelasan paling sederhana tentang cara kerja Komite: dari harga harian, rumus, empat AI yang berdebat, sampai cara membaca hasilnya.',
    deckLabel: 'Panduan Komite',
    prev: 'Sebelumnya',
    next: 'Berikutnya',
    slideOf: (n, t) => `${n} dari ${t}`,
    hint: 'Geser, atau pakai tombol panah',
    ctaPrimary: 'Buka Terminal',
    ctaSecondary: 'Baca Metodologi',
    slides: [
      {
        art: 'hello',
        kicker: 'Halo!',
        title: 'Ini Komite',
        body: 'Komite membaca data pasar setiap hari, lalu memberi tahu apa kata datanya. Bukan menyuruh kamu membeli atau menjual.',
      },
      {
        art: 'noise',
        kicker: 'Masalahnya',
        title: 'Pasar itu berisik',
        body: 'Setiap hari ada ribuan kabar dan ramalan. Banyak yang heboh, sedikit yang bisa dibuktikan. Susah tahu mana yang benar.',
        labels: ['PASTI NAIK!!', 'CUAN 300%', 'BESOK TERBANG'],
      },
      {
        art: 'prices',
        kicker: 'Langkah 1',
        title: 'Kami catat harganya',
        body: 'Setiap hari, harga saham, kripto, emas, dan komoditas dicatat apa adanya. Lengkap dengan jam kapan diambil.',
        labels: ['Saham', 'Kripto', 'Emas'],
      },
      {
        art: 'formula',
        kicker: 'Langkah 2',
        title: 'Kami hitung dengan rumus',
        body: 'Komputer menghitung angka-angka penting dengan rumus yang sama setiap hari. Tidak ada angka yang ditebak.',
        labels: ['rata-rata 200 hari', 'volume', 'naik-turun'],
      },
      {
        art: 'debate',
        kicker: 'Langkah 3',
        title: 'Empat AI berdebat',
        body: 'Satu AI melapor fakta, satu menyusun pendapat, satu mencari kesalahannya, dan satu memutuskan. Seperti rapat kecil.',
        labels: ['Pelapor', 'Penyusun', 'Pengkritik', 'Ketua'],
      },
      {
        art: 'reading',
        kicker: 'Hasilnya',
        title: 'Bukan "beli" atau "jual"',
        body: 'Hasilnya adalah ke mana bukti condong: positif, berimbang, atau negatif. Kamu yang tetap memutuskan.',
        labels: ['Bukti positif', 'Berimbang', 'Bukti negatif'],
      },
      {
        art: 'unknown',
        kicker: 'Jujur',
        title: 'Kalau tidak tahu, kami bilang',
        body: 'Kalau datanya kurang, Komite menulis "tidak dinilai". Lebih baik bilang tidak tahu daripada mengarang jawaban.',
        labels: ['Tidak dinilai'],
      },
      {
        art: 'steps',
        kicker: 'Cara pakai',
        title: 'Tiga langkah saja',
        body: 'Buat akun gratis. Pilih aset yang kamu penasaran. Baca kartu skornya dan obrolan keempat AI itu.',
        labels: ['Daftar gratis', 'Pilih aset', 'Baca hasilnya'],
      },
      {
        art: 'promise',
        kicker: 'Ingat ya',
        title: 'Alat bantu, bukan nasihat',
        body: 'Komite membantu kamu memahami data. Keputusan dan risikonya tetap milikmu. Selamat mencoba!',
      },
    ],
  },

  en: {
    metaTitle: 'User guide — Komite in 9 slides',
    metaDescription:
      'The simplest explanation of how Komite works: daily prices, formulas, four AIs that debate, and how to read the result.',
    deckLabel: 'Komite guide',
    prev: 'Previous',
    next: 'Next',
    slideOf: (n, t) => `${n} of ${t}`,
    hint: 'Swipe, or use the arrow keys',
    ctaPrimary: 'Open the terminal',
    ctaSecondary: 'Read the methodology',
    slides: [
      {
        art: 'hello',
        kicker: 'Hi there!',
        title: 'This is Komite',
        body: 'Komite reads market data every day and tells you what the data says. It never tells you to buy or sell.',
      },
      {
        art: 'noise',
        kicker: 'The problem',
        title: 'Markets are noisy',
        body: 'Every day brings thousands of headlines and predictions. Many are loud, few can be proven. It is hard to know what is true.',
        labels: ['TO THE MOON!!', '300% GAINS', 'SURE THING'],
      },
      {
        art: 'prices',
        kicker: 'Step 1',
        title: 'We record the prices',
        body: 'Every day we write down the prices of stocks, crypto, gold, and commodities exactly as they are, with the time we fetched them.',
        labels: ['Stocks', 'Crypto', 'Gold'],
      },
      {
        art: 'formula',
        kicker: 'Step 2',
        title: 'We calculate with formulas',
        body: 'A computer works out the important numbers with the same formulas every day. No number is ever guessed.',
        labels: ['200-day average', 'volume', 'ups and downs'],
      },
      {
        art: 'debate',
        kicker: 'Step 3',
        title: 'Four AIs debate',
        body: 'One AI reports the facts, one forms an opinion, one hunts for its mistakes, and one decides. Like a small meeting.',
        labels: ['Reporter', 'Planner', 'Critic', 'Chair'],
      },
      {
        art: 'reading',
        kicker: 'The result',
        title: 'Not "buy" or "sell"',
        body: 'The result shows which way the evidence leans: positive, balanced, or negative. You still make the decision.',
        labels: ['Positive', 'Balanced', 'Negative'],
      },
      {
        art: 'unknown',
        kicker: 'Honest',
        title: 'If we do not know, we say so',
        body: 'When there is not enough data, Komite writes "not rated". Saying "I don\'t know" beats making up an answer.',
        labels: ['Not rated'],
      },
      {
        art: 'steps',
        kicker: 'How to use it',
        title: 'Just three steps',
        body: 'Create a free account. Pick an asset you are curious about. Read its score card and the four AIs\' conversation.',
        labels: ['Sign up free', 'Pick an asset', 'Read the result'],
      },
      {
        art: 'promise',
        kicker: 'Remember',
        title: 'A helper, not advice',
        body: 'Komite helps you understand the data. The decision and the risk stay yours. Enjoy exploring!',
      },
    ],
  },

  zh: {
    metaTitle: '使用指南 — 9 页看懂 Komite',
    metaDescription:
      '用最简单的话说明 Komite 如何运作：每日价格、计算公式、四个互相辩论的 AI，以及如何读懂结果。',
    deckLabel: 'Komite 使用指南',
    prev: '上一页',
    next: '下一页',
    slideOf: (n, t) => `第 ${n} / ${t} 页`,
    hint: '左右滑动，或使用方向键',
    ctaPrimary: '打开终端',
    ctaSecondary: '阅读方法说明',
    slides: [
      {
        art: 'hello',
        kicker: '你好！',
        title: '这里是 Komite',
        body: 'Komite 每天阅读市场数据，然后告诉你数据在说什么。它从不叫你买入或卖出。',
      },
      {
        art: 'noise',
        kicker: '问题在哪',
        title: '市场太吵了',
        body: '每天都有成千上万的消息和预测。喊得响的很多，能证明的很少。很难分辨哪条是真的。',
        labels: ['必涨!!', '收益300%', '明天起飞'],
      },
      {
        art: 'prices',
        kicker: '第 1 步',
        title: '我们记录价格',
        body: '每天把股票、加密货币、黄金和大宗商品的价格如实记下来，连同获取的时间。',
        labels: ['股票', '加密货币', '黄金'],
      },
      {
        art: 'formula',
        kicker: '第 2 步',
        title: '我们用公式计算',
        body: '电脑每天用同样的公式算出重要的数字。没有任何一个数字是猜出来的。',
        labels: ['200日均线', '成交量', '涨跌'],
      },
      {
        art: 'debate',
        kicker: '第 3 步',
        title: '四个 AI 互相辩论',
        body: '一个 AI 报告事实，一个提出观点，一个专门挑错，一个做出结论。就像一场小会议。',
        labels: ['报告员', '策划员', '挑错员', '主席'],
      },
      {
        art: 'reading',
        kicker: '结果',
        title: '不是"买"或"卖"',
        body: '结果只说明证据偏向哪一边：正面、平衡或负面。最终决定仍然由你来做。',
        labels: ['正面', '平衡', '负面'],
      },
      {
        art: 'unknown',
        kicker: '诚实',
        title: '不知道，就直说',
        body: '数据不够时，Komite 会写"未评估"。说"不知道"总比编一个答案好。',
        labels: ['未评估'],
      },
      {
        art: 'steps',
        kicker: '怎么用',
        title: '只要三步',
        body: '注册一个免费账户。选一个你感兴趣的资产。看它的评分卡和四个 AI 的对话。',
        labels: ['免费注册', '选择资产', '阅读结果'],
      },
      {
        art: 'promise',
        kicker: '请记住',
        title: '是助手，不是投资建议',
        body: 'Komite 帮你看懂数据。决定和风险始终属于你自己。祝你探索愉快！',
      },
    ],
  },

  ja: {
    metaTitle: 'ご利用ガイド — 9枚でわかる Komite',
    metaDescription:
      'Komite のしくみをいちばんやさしく説明します。毎日の価格、計算式、議論する4つのAI、そして結果の読み方。',
    deckLabel: 'Komite ガイド',
    prev: '前へ',
    next: '次へ',
    slideOf: (n, t) => `${n} / ${t}`,
    hint: 'スワイプするか、矢印キーを使ってください',
    ctaPrimary: 'ターミナルを開く',
    ctaSecondary: '方法論を読む',
    slides: [
      {
        art: 'hello',
        kicker: 'こんにちは！',
        title: 'これが Komite です',
        body: 'Komite は毎日マーケットのデータを読み、データが何を示しているかを伝えます。「買え」「売れ」とは言いません。',
      },
      {
        art: 'noise',
        kicker: 'こまったこと',
        title: 'マーケットはさわがしい',
        body: '毎日たくさんのニュースや予想があふれています。声が大きいものは多く、証明できるものは少し。何が本当かわかりにくいのです。',
        labels: ['絶対上がる!!', '利益300%', '明日爆上げ'],
      },
      {
        art: 'prices',
        kicker: 'ステップ1',
        title: '価格を記録します',
        body: '株、暗号資産、金、商品の価格を毎日そのまま記録します。いつ取得したかの時刻もいっしょに。',
        labels: ['株', '暗号資産', '金'],
      },
      {
        art: 'formula',
        kicker: 'ステップ2',
        title: '計算式で計算します',
        body: 'コンピューターが毎日同じ計算式で大事な数字を出します。あてずっぽうの数字はひとつもありません。',
        labels: ['200日平均', '出来高', '上げ下げ'],
      },
      {
        art: 'debate',
        kicker: 'ステップ3',
        title: '4つのAIが話し合います',
        body: '1つは事実を報告し、1つは意見をまとめ、1つはまちがいを探し、1つが決めます。小さな会議のようです。',
        labels: ['報告係', '計画係', '批判係', '議長'],
      },
      {
        art: 'reading',
        kicker: '結果',
        title: '「買い」「売り」ではありません',
        body: '結果は、証拠がどちらに傾いているかを示すだけ。ポジティブ、中立、ネガティブ。決めるのはあなたです。',
        labels: ['ポジティブ', '中立', 'ネガティブ'],
      },
      {
        art: 'unknown',
        kicker: '正直に',
        title: 'わからないときは、そう言います',
        body: 'データが足りないとき、Komite は「評価なし」と書きます。答えをつくるより「わからない」と言うほうがいいからです。',
        labels: ['評価なし'],
      },
      {
        art: 'steps',
        kicker: '使いかた',
        title: 'たった3ステップ',
        body: '無料アカウントをつくる。気になる銘柄を選ぶ。スコアカードと4つのAIの会話を読む。',
        labels: ['無料登録', '銘柄を選ぶ', '結果を読む'],
      },
      {
        art: 'promise',
        kicker: 'おぼえておいてね',
        title: '助けにはなるけど、助言ではありません',
        body: 'Komite はデータを理解するお手伝いをします。決めるのも、リスクを負うのもあなたです。楽しんでください！',
      },
    ],
  },

  ru: {
    metaTitle: 'Руководство — Komite за 9 слайдов',
    metaDescription:
      'Самое простое объяснение того, как работает Komite: ежедневные цены, формулы, четыре спорящих ИИ и как читать результат.',
    deckLabel: 'Руководство Komite',
    prev: 'Назад',
    next: 'Далее',
    slideOf: (n, t) => `${n} из ${t}`,
    hint: 'Листайте или используйте стрелки',
    ctaPrimary: 'Открыть терминал',
    ctaSecondary: 'Читать методологию',
    slides: [
      {
        art: 'hello',
        kicker: 'Привет!',
        title: 'Это Komite',
        body: 'Komite каждый день читает рыночные данные и рассказывает, что они говорят. Он никогда не говорит вам покупать или продавать.',
      },
      {
        art: 'noise',
        kicker: 'В чём проблема',
        title: 'На рынке слишком шумно',
        body: 'Каждый день — тысячи новостей и прогнозов. Громких много, доказанных мало. Трудно понять, чему верить.',
        labels: ['ТОЧНО ВЫРАСТЕТ!!', '+300%', 'ЗАВТРА НА ЛУНУ'],
      },
      {
        art: 'prices',
        kicker: 'Шаг 1',
        title: 'Мы записываем цены',
        body: 'Каждый день мы записываем цены акций, криптовалют, золота и сырья такими, какие они есть, — вместе со временем получения.',
        labels: ['Акции', 'Крипто', 'Золото'],
      },
      {
        art: 'formula',
        kicker: 'Шаг 2',
        title: 'Считаем по формулам',
        body: 'Компьютер каждый день считает важные числа по одним и тем же формулам. Ни одно число не угадано.',
        labels: ['среднее за 200 дней', 'объём', 'рост и падение'],
      },
      {
        art: 'debate',
        kicker: 'Шаг 3',
        title: 'Четыре ИИ спорят',
        body: 'Один ИИ сообщает факты, второй предлагает мнение, третий ищет в нём ошибки, четвёртый решает. Как маленькое совещание.',
        labels: ['Докладчик', 'Автор идеи', 'Критик', 'Председатель'],
      },
      {
        art: 'reading',
        kicker: 'Результат',
        title: 'Не «купить» и не «продать»',
        body: 'Результат показывает, куда склоняются факты: позитивно, нейтрально или негативно. Решение всё равно за вами.',
        labels: ['Позитивно', 'Нейтрально', 'Негативно'],
      },
      {
        art: 'unknown',
        kicker: 'Честно',
        title: 'Если не знаем — так и говорим',
        body: 'Когда данных мало, Komite пишет «без оценки». Лучше сказать «не знаю», чем придумать ответ.',
        labels: ['Без оценки'],
      },
      {
        art: 'steps',
        kicker: 'Как пользоваться',
        title: 'Всего три шага',
        body: 'Создайте бесплатный аккаунт. Выберите интересный актив. Прочитайте его карточку оценки и разговор четырёх ИИ.',
        labels: ['Бесплатная регистрация', 'Выбрать актив', 'Прочитать итог'],
      },
      {
        art: 'promise',
        kicker: 'Запомните',
        title: 'Помощник, а не совет',
        body: 'Komite помогает понять данные. Решение и риск остаются за вами. Приятного знакомства!',
      },
    ],
  },
}
