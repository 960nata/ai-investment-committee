import type { Metadata } from "next";
import { Suspense } from "react";
import { Plus_Jakarta_Sans } from "next/font/google";
import { GoogleAnalytics } from "@next/third-parties/google";
import { Analytics } from "@vercel/analytics/next";
import { getMeasurementId } from "@/lib/analytics/ga4";
import { VisitBeacon } from "@/components/visit-beacon";
import { MotionProvider } from "@/components/motion-kit";
import { SiteTranslator } from "@/components/site-translator";
import { SITE_NAME } from "@/lib/brand";
import "./globals.css";
import "./mobile.css";

const fontSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  // Alamat dasar untuk canonical, hreflang, dan Open Graph. Tanpa ini Next
  // menulis alamat relatif, dan Google menolak hreflang yang tidak absolut.
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  title: { default: `${SITE_NAME} — analisis probabilistik`, template: `%s — ${SITE_NAME}` },
  applicationName: SITE_NAME,
  openGraph: { siteName: SITE_NAME },
  description:
    "Alat analisis data untuk saham IDX, saham AS, dan crypto. " +
    "Menampilkan peluang beserta dasarnya, bukan anjuran.",
  keywords: ["saham", "analisis", "IDX", "crypto", "investasi", "probabilistik"],
  // Terjemahan bawaan Chrome dimatikan. Ia membungkus teks halaman dengan
  // <font>, lalu begitu React mengubah bagian itu (mis. saham lain diklik)
  // node yang dicari React sudah tidak ada dan seluruh halaman jatuh ke
  // "This page couldn't load". Penerjemah situs sendiri (SiteTranslator)
  // hanya mengganti isi teks, jadi aman. Sengaja lewat meta, bukan
  // translate="no" di <html>: atribut itu juga dihormati SiteTranslator dan
  // akan mematikan seluruh terjemahan situs.
  other: { google: "notranslate" },
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
