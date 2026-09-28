import type { CSSProperties } from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { LandingNav } from '@/components/landing-nav'
import { LandingFooter } from '@/components/landing-footer'
import { IconArrowRight, IconHeart, IconQr } from '@/components/icons'
import { getCurrentUser } from '@/lib/auth/user-auth'
import { verifyAdminSession } from '@/lib/auth/admin-auth'
import { getDonationSettings } from '@/lib/db/donation-queries'
import { PROVIDERS, methodHref, type DonationMethod } from '@/lib/donation/providers'
import { CopyValue } from './copy-value'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Dukung Kami',
  description: 'Bantu AI Investdesk tetap gratis dan mandiri lewat donasi sukarela.',
}

/*
 * Halaman donasi publik.
 *
 * Selama admin belum menyalakannya, halaman ini menjawab 404 — sama persis
 * dengan alamat yang tidak ada, supaya keberadaannya tidak bocor. Admin tetap
 * bisa melihat pratinjau lewat ?pratinjau=1.
 */

type LinkMethod = Extract<DonationMethod, { kind: 'provider' | 'custom' }>

function isLink(m: DonationMethod): m is LinkMethod {
  return m.kind === 'provider' || m.kind === 'custom'
}

function LinkCard({ method }: { method: LinkMethod }) {
  const provider = method.kind === 'provider' ? PROVIDERS[method.provider] : null
  const label = provider?.label ?? (method.kind === 'custom' ? method.label : '')
  const accent = provider?.color ?? 'var(--signal)'
  const href = methodHref(method)!

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="donate-link"
      style={{ '--accent': accent } as CSSProperties}
    >
      <span className="donate-link-mark" aria-hidden="true">
        {label.charAt(0)}
      </span>
      <span className="donate-link-body">
        <span className="donate-link-name">{label}</span>
        <span className="donate-link-handle mono notranslate" translate="no">
          {method.kind === 'provider' ? `@${method.handle}` : new URL(href).host}
        </span>
        {method.note && <span className="donate-link-note">{method.note}</span>}
      </span>
      <IconArrowRight size={16} className="donate-link-arrow" />
    </a>
  )
}

export default async function DonationPage({
  searchParams,
}: {
  searchParams: Promise<{ pratinjau?: string }>
}) {
  const [{ pratinjau }, settings, user, isAdmin] = await Promise.all([
    searchParams,
    getDonationSettings().catch(() => null),
    getCurrentUser(),
    verifyAdminSession().catch(() => false),
  ])

  const preview = !settings?.isEnabled && pratinjau === '1' && isAdmin
  if (!settings || (!settings.isEnabled && !preview)) notFound()

  const methods = settings.methods.filter((m) => m.isActive)
  const qris = methods.filter((m) => m.kind === 'qris')
  const local = methods.filter(
    (m): m is LinkMethod => isLink(m) && m.kind === 'provider' && PROVIDERS[m.provider].region === 'id',
  )
  const international = methods.filter(
    (m): m is LinkMethod =>
      isLink(m) && (m.kind === 'custom' || PROVIDERS[m.provider].region === 'intl'),
  )
  const direct = methods.filter((m) => m.kind === 'copy')

  return (
    <div className="landing-shell">
      <LandingNav isAdmin={isAdmin} user={user} />

      <main className="donate-page">
        {preview && (
          <div className="donate-preview mono">
            PRATINJAU ADMIN — halaman ini masih TERSEMBUNYI dari publik.
          </div>
        )}

        <header className="donate-hero">
          <span className="donate-hero-glyph" aria-hidden="true">
            <IconHeart size={26} />
          </span>
          <h1 className="donate-title">{settings.title}</h1>
          {settings.message && <p className="donate-lead">{settings.message}</p>}
        </header>

        {methods.length === 0 && (
          <p className="donate-empty mono">Metode donasi sedang disiapkan.</p>
        )}

        {qris.length > 0 && (
          <section className="donate-section">
            <h2 className="donate-section-title mono">Scan QRIS</h2>
            <div className="donate-qris-row">
              {qris.map((m) => (
                <figure key={m.id} className="donate-qris">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.imageUrl} alt={`Kode QRIS: ${m.label}`} loading="lazy" />
                  <figcaption>
                    <span className="donate-qris-label">
                      <IconQr size={14} /> {m.label}
                    </span>
                    <span className="donate-qris-note">
                      {m.note || 'Bisa dibayar dari GoPay, OVO, DANA, ShopeePay, LinkAja, dan semua m-banking.'}
                    </span>
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>
        )}

        {local.length > 0 && (
          <section className="donate-section">
            <h2 className="donate-section-title mono">Dari Indonesia</h2>
            <div className="donate-grid">
              {local.map((m) => (
                <LinkCard key={m.id} method={m} />
              ))}
            </div>
          </section>
        )}

        {international.length > 0 && (
          <section className="donate-section">
            <h2 className="donate-section-title mono">International</h2>
            <div className="donate-grid">
              {international.map((m) => (
                <LinkCard key={m.id} method={m} />
              ))}
            </div>
          </section>
        )}

        {direct.length > 0 && (
          <section className="donate-section">
            <h2 className="donate-section-title mono">Transfer langsung</h2>
            <div className="donate-grid">
              {direct.map((m) => (
                <div key={m.id} className="donate-direct">
                  <span className="donate-link-name">{m.label}</span>
                  <code className="donate-direct-value notranslate" translate="no">
                    {m.value}
                  </code>
                  {m.note && <span className="donate-link-note">{m.note}</span>}
                  <CopyValue value={m.value} />
                </div>
              ))}
            </div>
          </section>
        )}

        <p className="donate-footnote">
          Donasi bersifat sukarela dan tidak membuka fitur tambahan. Seluruh terminal tetap gratis
          untuk semua orang. Terima kasih sudah ikut menjaganya tetap hidup.
        </p>
      </main>

      <LandingFooter />
    </div>
  )
}
