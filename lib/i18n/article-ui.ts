import type { Locale } from './locales'

/**
 * Teks antarmuka di sekitar artikel warta, per bahasa.
 *
 * Isi artikelnya ditulis agen; teks di sini — tombol, label, keterangan — ditulis
 * tangan sekali dan tidak berubah per artikel.
 */
export interface ArticleUi {
  back: string
  impact: string
  sentiment: string
  sentiments: Record<string, string>
  by: string
  minutesRead: (n: number) => string
  readers: string
  keyPoints: string
  video: string
  mentionedAssets: string
  terminalNote: [before: string, link: string, after: string]
  related: string
  readMore: string
  language: string
  aiNote: string
  indexTitle: string
  indexLede: string
  empty: string
  notFound: string
}

export const ARTICLE_UI: Record<Locale, ArticleUi> = {
  id: {
    back: 'Kembali ke indeks warta',
    impact: 'Dampak',
    sentiment: 'Sentimen',
    sentiments: { bullish: 'positif', bearish: 'negatif', neutral: 'netral', mixed: 'campuran' },
    by: 'Oleh',
    minutesRead: (n) => `${n} menit baca`,
    readers: 'pembaca',
    keyPoints: 'Poin kunci',
    video: 'Video',
    mentionedAssets: 'Aset yang disebut dalam laporan ini',
    terminalNote: [
      'Grafik harga dan penilaian komite untuk aset di atas ada di terminal. ',
      'Buat akun gratis',
      ' untuk membukanya.',
    ],
    related: 'Warta terkait',
    readMore: 'Baca analisis',
    language: 'Bahasa',
    aiNote: '',
    indexTitle: 'Warta pasar',
    indexLede: 'Berita pasar dengan skor dampak dan kaitan ke asetnya.',
    empty: 'Belum ada artikel.',
    notFound: 'Artikel tidak ditemukan',
  },
  en: {
    back: 'Back to market news',
    impact: 'Impact',
    sentiment: 'Sentiment',
    sentiments: { bullish: 'positive', bearish: 'negative', neutral: 'neutral', mixed: 'mixed' },
    by: 'By',
    minutesRead: (n) => `${n} min read`,
    readers: 'readers',
    keyPoints: 'Key points',
    video: 'Video',
    mentionedAssets: 'Assets mentioned in this report',
    terminalNote: [
      'Price charts and committee readings for these assets are in the terminal. ',
      'Create a free account',
      ' to open them.',
    ],
    related: 'Related news',
    readMore: 'Read analysis',
    language: 'Language',
    aiNote:
      'This version was written by our AI news desk from the original Indonesian article. Figures are identical to the original.',
    indexTitle: 'Market news',
    indexLede: 'Market news with an impact score and links to the assets involved.',
    empty: 'No articles in English yet.',
    notFound: 'Article not found',
  },
  zh: {
    back: '返回市场资讯',
    impact: '影响力',
    sentiment: '情绪',
    sentiments: { bullish: '正面', bearish: '负面', neutral: '中性', mixed: '分歧' },
    by: '作者',
    minutesRead: (n) => `阅读约 ${n} 分钟`,
    readers: '位读者',
    keyPoints: '要点',
    video: '视频',
    mentionedAssets: '本文提及的资产',
    terminalNote: ['上述资产的价格图表和委员会解读位于终端中。', '免费注册账户', '即可查看。'],
    related: '相关资讯',
    readMore: '阅读分析',
    language: '语言',
    aiNote: '本版本由 AI 新闻编辑部根据印尼语原文撰写，文中数据与原文完全一致。',
    indexTitle: '市场资讯',
    indexLede: '附带影响力评分并关联相关资产的市场资讯。',
    empty: '暂无中文文章。',
    notFound: '未找到文章',
  },
  ja: {
    back: 'マーケットニュース一覧へ戻る',
    impact: '影響度',
    sentiment: 'センチメント',
    sentiments: { bullish: 'ポジティブ', bearish: 'ネガティブ', neutral: '中立', mixed: '混在' },
    by: '執筆',
    minutesRead: (n) => `約${n}分で読めます`,
    readers: '人が閲覧',
    keyPoints: '要点',
    video: '動画',
    mentionedAssets: 'この記事で取り上げた銘柄',
    terminalNote: [
      'これらの銘柄の価格チャートと委員会の評価はターミナルで確認できます。',
      '無料アカウントを作成',
      'して開いてください。',
    ],
    related: '関連ニュース',
    readMore: '分析を読む',
    language: '言語',
    aiNote:
      'この版はインドネシア語の原文をもとに AI ニュースデスクが執筆しました。数値は原文と同一です。',
    indexTitle: 'マーケットニュース',
    indexLede: '影響度スコアと関連銘柄つきのマーケットニュース。',
    empty: '日本語の記事はまだありません。',
    notFound: '記事が見つかりません',
  },
  ru: {
    back: 'К рыночным новостям',
    impact: 'Влияние',
    sentiment: 'Настрой',
    sentiments: {
      bullish: 'позитивный',
      bearish: 'негативный',
      neutral: 'нейтральный',
      mixed: 'смешанный',
    },
    by: 'Автор',
    minutesRead: (n) => `${n} мин. чтения`,
    readers: 'читателей',
    keyPoints: 'Главное',
    video: 'Видео',
    mentionedAssets: 'Активы, упомянутые в статье',
    terminalNote: [
      'Графики цен и оценки комитета по этим активам доступны в терминале. ',
      'Создайте бесплатный аккаунт',
      ', чтобы открыть их.',
    ],
    related: 'Похожие новости',
    readMore: 'Читать анализ',
    language: 'Язык',
    aiNote:
      'Эта версия написана нашей AI-редакцией на основе оригинальной статьи на индонезийском. Все цифры совпадают с оригиналом.',
    indexTitle: 'Рыночные новости',
    indexLede: 'Новости рынка с оценкой влияния и привязкой к активам.',
    empty: 'Статей на русском пока нет.',
    notFound: 'Статья не найдена',
  },
}
