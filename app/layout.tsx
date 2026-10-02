import type { Metadata } from "next";
import { Suspense } from "react";
import { Plus_Jakarta_Sans } from "next/font/google";
import { GoogleAnalytics } from "@next/third-parties/google";
import { Analytics } from "@vercel/analytics/next";
import { getMeasurementId } from "@/lib/analytics/ga4";
import { VisitBeacon } from "@/components/visit-beacon";
import { MotionProvider } from "@/components/motion-kit";
import { SiteTranslator } from "@/components/site-translator";
import { SITE_NAME, SITE_DESCRIPTION, SITE_TAGLINE, getBaseUrl } from "@/lib/brand";
import { ADSENSE_CLIENT } from "@/lib/ads/adsense";
import "./globals.css";
import "./mobile.css";

const fontSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const siteUrl = getBaseUrl();

export const metadata: Metadata = {
  // Alamat dasar untuk canonical, hreflang, dan Open Graph.
  // Otomatis menunjuk domain produksi resmi https://aiinvestdesk.com jika di deploy
  metadataBase: new URL(siteUrl),
  title: {
    default: `${SITE_NAME} — ${SITE_TAGLINE}`,
    template: `%s — ${SITE_NAME}`,
  },
  applicationName: SITE_NAME,
  description: SITE_DESCRIPTION,
  keywords: [
    "AI Investdesk",
    "aiinvestdesk.com",
    "analisis saham",
    "saham IDX",
    "saham AS",
    "analisis probabilistik",
    "kripto",
    "crypto",
    "investasi",
    "terminal investasi AI",
    "prediksi saham",
    "IHSG",
    "fintech Indonesia",
    "probabilitas investasi",
  ],
  alternates: {
    canonical: siteUrl,
  },
  openGraph: {
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    url: siteUrl,
    siteName: SITE_NAME,
    locale: "id_ID",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  verification: {
    google: "NtftDAwujuLQyXmxBa2q2cBv_wqnVO1h1TNUigXmVL0",
  },
  other: { "google-adsense-account": ADSENSE_CLIENT },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const measurementId = getMeasurementId();

  return (
    <html lang="id" suppressHydrationWarning className={fontSans.className}>
      <body suppressHydrationWarning className={fontSans.className}>
        <MotionProvider>{children}</MotionProvider>
        {/*
         * `useSearchParams` di dalam VisitBeacon membuat seluruh pohon di
         * atasnya keluar dari prarender statis kalau batasnya tidak dipasang.
         * Suspense di sini menahan batas itu, dan karena komponennya tidak
         * menggambar apa pun, tidak ada yang perlu ditampilkan selagi menunggu.
         */}
        <Suspense fallback={null}>
          <VisitBeacon />
        </Suspense>
        <SiteTranslator />
        {/*
         * Skripnya dilayani dari asal sendiri (/_vercel/insights), jadi CSP di
         * proxy.ts tidak perlu ditambah: ia dimuat oleh bundel bernonce, dan
         * 'strict-dynamic' sudah mempercayainya.
         */}
        <Analytics />
      </body>
      {measurementId && <GoogleAnalytics gaId={measurementId} />}
    </html>
  );
}
