"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="app-layout">
      {/* Sidebar */}
      <aside className="sidebar">
        <Link href="/" className="sidebar-logo">
          <div className="sidebar-logo-icon">I</div>
          <span className="sidebar-logo-text">Investasi</span>
          <span className="sidebar-logo-badge">α</span>
        </Link>

        <nav className="sidebar-nav">
          <span className="sidebar-label">Pasar</span>
          <Link
            href="/"
            className={`sidebar-link ${pathname === "/" ? "active" : ""}`}
          >
            <span className="sidebar-link-icon">📊</span>
            Dashboard
          </Link>
          <Link
            href="/instruments"
            className={`sidebar-link ${pathname === "/instruments" ? "active" : ""}`}
          >
            <span className="sidebar-link-icon">📈</span>
            Instrumen
          </Link>

          <span className="sidebar-label">Sistem</span>
          <Link
            href="/pipeline"
            className={`sidebar-link ${pathname === "/pipeline" ? "active" : ""}`}
          >
            <span className="sidebar-link-icon">⚙️</span>
            Pipeline
          </Link>
        </nav>

        {/* Bottom section */}
        <div style={{ marginTop: "auto", paddingTop: "var(--space-lg)" }}>
          <div
            style={{
              padding: "var(--space-md)",
              background: "var(--bg-glass)",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-primary)",
            }}
          >
            <div
              style={{
                fontSize: "11px",
                fontWeight: 600,
                color: "var(--text-muted)",
                textTransform: "uppercase" as const,
                letterSpacing: "0.5px",
                marginBottom: "var(--space-xs)",
              }}
            >
              Fase 0 — Fondasi
            </div>
            <div
              style={{
                fontSize: "12px",
                color: "var(--text-tertiary)",
                lineHeight: 1.5,
              }}
            >
              Mesin analisis probabilistik.
              <br />
              Bukan peramal harga.
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">{children}</main>
    </div>
  );
}
