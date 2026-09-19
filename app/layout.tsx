import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Investasi — Analisis Probabilistik Multi-Horizon",
  description:
    "Mesin analisis saham IDX, US, dan crypto berbasis probabilitas. " +
    "Bukan peramal harga — alat analisis data dengan track record terbuka.",
  keywords: ["saham", "analisis", "IDX", "crypto", "investasi", "probabilistik"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
