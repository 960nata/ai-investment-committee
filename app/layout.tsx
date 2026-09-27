import type { Metadata } from "next";
import { Suspense } from "react";
import { Plus_Jakarta_Sans } from "next/font/google";
import { GoogleAnalytics } from "@next/third-parties/google";
import { getMeasurementId } from "@/lib/analytics/ga4";
import { VisitBeacon } from "@/components/visit-beacon";
import { SiteTranslator } from "@/components/site-translator";
import "./globals.css";

const fontSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  // Alamat dasar untuk canonical, hreflang, dan Open Graph. Tanpa ini Next
  // menulis alamat relatif, dan Google menolak hreflang yang tidak absolut.
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  title: { default: "Komite — analisis probabilistik", template: "%s — Komite" },
  description:
    "Alat analisis data untuk saham IDX, saham AS, dan crypto. " +
    "Menampilkan peluang beserta dasarnya, bukan anjuran.",
  keywords: ["saham", "analisis", "IDX", "crypto", "investasi", "probabilistik"],
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
        {children}
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
      </body>
      {measurementId && <GoogleAnalytics gaId={measurementId} />}
    </html>
  );
}
