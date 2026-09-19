import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
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
  return (
    <html lang="id" suppressHydrationWarning>
      {/*
         * Ekstensi peramban menyuntik atribut ke <html> dan <body> sebelum React
         * sempat hydrate — bis_skin_checked, webcrx, crxlauncher, dan sejenisnya.
         * Peredam ini hanya membungkam peringatan pada dua elemen itu; perbedaan
         * di dalam pohon tetap dilaporkan seperti biasa.
         */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
