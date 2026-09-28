import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { LandingNav } from '@/components/landing-nav'
import { LandingFooter } from '@/components/landing-footer'
import { IconCheck, IconCrown } from '@/components/icons'
import { getCurrentUser } from '@/lib/auth/user-auth'
import { verifyAdminSession } from '@/lib/auth/admin-auth'
import { getEntitlement, getOrderForUser, getPremiumSettings } from '@/lib/db/premium-queries'
import { isTripayConfigured, listChannels, type PaymentChannel } from '@/lib/payment/tripay'
import { PremiumCheckout } from './premium-checkout'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Premium',
  description: 'Model AI terkuat, kuota lebih longgar, dan ikut menjaga AI Investdesk tetap mandiri.',
}

/*
 * Halaman Premium publik.
 *
 * Selama admin belum menyalakannya, halaman ini menjawab 404 — sama persis
 * dengan alamat yang tidak ada. Admin tetap bisa melihat pratinjau lewat
 * ?pratinjau=1. Setelah membayar, Tripay mengembalikan pembeli ke sini dengan
 * ?ref=..., dan status pesanannya ditampilkan di atas.
 */

const ORDER_TEXT: Record<string, { tone: 'ok' | 'wait' | 'bad'; text: string }> = {
  PAID: { tone: 'ok', text: 'Pembayaran diterima. Premium Anda sudah aktif — terima kasih!' },
  GRANTED: { tone: 'ok', text: 'Premium Anda sudah aktif.' },
  UNPAID: {
    tone: 'wait',
    text: 'Menunggu pembayaran. Setelah Anda membayar, status berubah otomatis dalam beberapa detik — muat ulang halaman ini.',
  },
  EXPIRED: { tone: 'bad', text: 'Tagihan ini sudah kedaluwarsa. Silakan buat tagihan baru.' },
  FAILED: { tone: 'bad', text: 'Pembayaran gagal. Silakan coba lagi dengan metode lain.' },
  REFUND: { tone: 'bad', text: 'Pembayaran ini sudah dikembalikan.' },
}

export default async function PremiumPage({
  searchParams,
}: {
  searchParams: Promise<{ pratinjau?: string; ref?: string }>
}) {
  const [{ pratinjau, ref }, settings, user, isAdmin] = await Promise.all([
    searchParams,
    getPremiumSettings().catch(() => null),
    getCurrentUser(),
    verifyAdminSession().catch(() => false),
  ])

  const preview = !settings?.isEnabled && pratinjau === '1' && isAdmin
  if (!settings || (!settings.isEnabled && !preview)) notFound()

  const plans = settings.plans.filter((p) => p.isActive)

  const [entitlement, order, channels] = await Promise.all([
    user ? getEntitlement(user.uid) : null,
    user && ref && /^[A-Z0-9-]{6,64}$/.test(ref) ? getOrderForUser(user.uid, ref).catch(() => null) : null,
    user && isTripayConfigured() ? listChannels().catch((): PaymentChannel[] => []) : ([] as PaymentChannel[]),
  ])

  const orderInfo = order ? ORDER_TEXT[order.status] : null
  const { free, premium } = settings.limits

  return (
    <div className="landing-shell">
      <LandingNav isAdmin={isAdmin} user={user} />

      <main className="donate-page">
        {preview && (
          <div className="donate-preview mono">PRATINJAU ADMIN — halaman ini masih TERSEMBUNYI dari publik.</div>
        )}

        {orderInfo && (
          <div className={`premium-status premium-status-${orderInfo.tone}`} role="status">
            <strong className="mono">{order!.planLabel}</strong> · {orderInfo.text}
          </div>
        )}

        <header className="donate-hero">
          <span className="donate-hero-glyph" aria-hidden="true">
            <IconCrown size={26} />
          </span>
          <h1 className="donate-title">{settings.title}</h1>
          {settings.message && <p className="donate-lead">{settings.message}</p>}
          {entitlement?.isPremium && entitlement.premiumUntil && (
            <p className="premium-active mono">
              <IconCrown size={14} /> Premium aktif sampai{' '}
              {entitlement.premiumUntil.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}.
              Membeli lagi menambah hari ke sisa yang berjalan.
            </p>
          )}
        </header>

        {settings.benefits.length > 0 && (
          <section className="donate-section">
            <h2 className="donate-section-title mono">Yang Anda dapat</h2>
            <ul className="premium-benefits">
              {settings.benefits.map((b) => (
                <li key={b}>
                  <IconCheck size={14} /> {b}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="donate-section">
          <h2 className="donate-section-title mono">Gratis vs Premium</h2>
          <div className="premium-compare">
            <table className="mono">
              <thead>
                <tr>
                  <th />
                  <th>Gratis</th>
                  <th>Premium</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Model AI Tanya Komite</td>
                  <td>Standar</td>
                  <td>Terkuat</td>
                </tr>
                <tr>
                  <td>Tanya Komite / hari</td>
                  <td>{free.askPerDay}</td>
                  <td>{premium.askPerDay}</td>
                </tr>
                <tr>
                  <td>Watchlist</td>
                  <td>{free.watchlist}</td>
                  <td>{premium.watchlist}</td>
                </tr>
                <tr>
                  <td>Alert</td>
                  <td>{free.alerts}</td>
                  <td>{premium.alerts}</td>
                </tr>
                <tr>
                  <td>Skor, komite, warta, screener</td>
                  <td>Ya</td>
                  <td>Ya</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="donate-section">
          <h2 className="donate-section-title mono">Pilih paket</h2>
          {plans.length === 0 ? (
            <p className="donate-empty mono">Paket sedang disiapkan.</p>
          ) : user ? (
            <PremiumCheckout
              plans={plans}
              channels={channels.map((c) => ({
                code: c.code,
                name: c.name,
                group: c.group,
                feeFlat: c.feeFlat,
                feePercent: c.feePercent,
              }))}
              paymentReady={isTripayConfigured()}
            />
          ) : (
            <div className="premium-login">
              <p>Masuk dulu supaya Premium tercatat di akun Anda.</p>
              <Link href="/login?next=/premium" className="btn btn-primary">
                Masuk atau daftar
              </Link>
            </div>
          )}
        </section>

        <p className="donate-footnote">
          Pembayaran diproses oleh Tripay (QRIS, virtual account, e-wallet). Premium bukan langganan otomatis —
          tidak ada tagihan berulang. AI Investdesk adalah alat analisis data, bukan penasihat investasi; Premium
          tidak mengubah sifat itu.
        </p>
      </main>

      <LandingFooter />
    </div>
  )
}
