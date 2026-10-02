import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHmac, randomBytes } from 'node:crypto'
import { once } from 'node:events'

/** Requires npm run build. Isolated credentials; no database or paid provider requests. */
async function main() {
  const pin = randomBytes(32).toString('hex')
  const port = 32000 + Math.floor(Math.random() * 10000)
  const base = `http://127.0.0.1:${port}`
  const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(port), '-H', '127.0.0.1'], {
    stdio: 'ignore', env: {
      ...process.env, NODE_ENV: 'production', ADMIN_SECRET_KEY: pin, ADMIN_PIN: '', ADMIN_LOGIN_SLUG: '',
      SESSION_SECRET: randomBytes(32).toString('hex'), DATABASE_URL: '', DIRECT_URL: '',
      UPSTASH_REDIS_REST_URL: '', UPSTASH_REDIS_REST_TOKEN: '',
    },
  })
  const request = (path: string, init: RequestInit = {}) => fetch(base + path, {
    ...init, redirect: 'manual', signal: AbortSignal.timeout(15_000),
    headers: { 'user-agent': 'Mozilla/5.0 integration-test', ...init.headers },
  })
  try {
    let ready = false
    for (let i = 0; i < 100; i++) {
      if (server.exitCode !== null) throw new Error('Production server exited before readiness')
      try { if ((await request('/api/v1/admin/auth')).ok) { ready = true; break } } catch { /* startup */ }
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
    assert.ok(ready, 'Production server readiness')
    assert.equal((await request('/api/v1/admin/ai-tokens')).status, 401)
    assert.equal((await request('/api/v1/user/portfolio')).status, 401)
    assert.equal((await request('/api/v1/premium/checkout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 401)
    assert.equal((await request('/api/v1/payment/tripay/callback', { method: 'POST', body: '{}' })).status, 401)
    const protectedPage = await request('/backtest')
    assert.equal(protectedPage.status, 307)
    assert.ok(protectedPage.headers.get('location')?.includes('/login'))
    for (const path of ['/admin/ai-tokens', '/admin/aktivitas-ai', '/admin/users']) {
      const page = await request(path, { headers: { purpose: 'prefetch', 'next-router-prefetch': '1' } })
      assert.equal(page.status, 404, `${path} must authorize even when proxy is skipped`)
    }
    const login = await request('/api/v1/admin/auth', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pin }),
    })
    assert.equal(login.status, 200)
    const cookie = login.headers.get('set-cookie')?.split(';')[0]
    assert.ok(cookie)
    const dashboard = await request('/api/v1/admin/ai-tokens', { headers: { cookie } })
    assert.equal(dashboard.status, 200)
    const data = await dashboard.json()
    assert.equal(data.storage, 'memory')
    assert.ok(data.configuration.some((p: { id: string }) => p.id === 'openai'))
    assert.ok(data.configuration.some((p: { id: string }) => p.id === 'cloudflare'))
    assert.ok(Array.isArray(data.recentCalls))
    assert.ok(!JSON.stringify(data).includes(pin))
    const activityPage = await request('/admin/aktivitas-ai', { headers: { cookie } })
    assert.equal(activityPage.status, 200)
    assert.ok((await activityPage.text()).includes('Alur'))
    const expires = Math.floor(Date.now() / 1000) - 1
    const signature = createHmac('sha256', pin).update(`admin:${expires}`).digest('hex')
    assert.equal((await request('/api/v1/admin/ai-tokens', { headers: { cookie: `komite_admin_session=${expires}.${signature}` } })).status, 401)
    const logout = await request('/api/v1/admin/auth', { method: 'DELETE', headers: { cookie } })
    assert.equal(logout.status, 200)
    assert.ok(logout.headers.get('set-cookie')?.includes('Max-Age=0'))
    console.log('HTTP checks passed: admin login/logout/expiry, prefetch authorization, monitoring, portfolio/checkout protection, callback signature.')
  } finally {
    server.kill('SIGTERM')
    if (server.exitCode === null) await once(server, 'exit')
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
