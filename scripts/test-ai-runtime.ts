import assert from 'node:assert/strict'
import { LLM_ADAPTERS, PREMIUM_LLM_ADAPTERS } from '../lib/ai/adapters'
import { complete, resetRegistry, llmStatus } from '../lib/ai/registry'
import { LlmError, type LlmAdapter } from '../lib/ai/types'
import { getAiTokensDashboardData } from '../lib/ai/telemetry'
import { resetLocalState } from '../lib/ai/keyring'
import { reconcileSession } from '../lib/auth/verified-session'
import { cache } from '../lib/cache/redis'
import { cloudflareAdapter } from '../lib/ai/providers/cloudflare'

async function main() {
  // No env loader and no real network: providers and storage are controlled fakes.
  const originals = [...LLM_ADAPTERS]
  const premium = [...PREMIUM_LLM_ADAPTERS]
  const originalAvailable = cache.isAvailable
  const originalPipeline = cache.pipeline
  cache.isAvailable = () => false
  const calls: string[] = []
  const provider = (id: string, fail?: 'rate_limited' | 'server' | 'bad_request'): LlmAdapter => ({
    id, name: id, model: 'test-model', envPrefix: `TEST_${id}_KEY`,
    async complete(request, _key, keyIndex) {
      calls.push(id)
      assert.ok(request.timeoutMs! > 0 && request.timeoutMs! <= 30_000)
      if (fail) throw new LlmError(id, fail, 'synthetic failure', fail === 'rate_limited' ? 429 : 500)
      return { text: 'OK', providerId: id, model: 'test-model', keyIndex, latencyMs: 10, inputTokens: 5, outputTokens: 2 }
    },
  })
  function setup(adapters: LlmAdapter[]) {
    calls.length = 0
    LLM_ADAPTERS.splice(0, LLM_ADAPTERS.length, ...adapters)
    PREMIUM_LLM_ADAPTERS.splice(0)
    for (const a of adapters) process.env[a.envPrefix] = `fake-${a.id}`
    resetRegistry(); resetLocalState()
  }
  const request = { messages: [{ role: 'user' as const, content: 'test' }], feature: 'runtime-test' }
  try {
    setup([provider('first', 'server'), provider('second')])
    const response = await complete(request)
    assert.equal(response.providerId, 'second')
    assert.deepEqual(calls, ['first', 'second'])
    let dashboard = await getAiTokensDashboardData()
    const trace = dashboard.recentCalls.filter((e) => e.feature === 'runtime-test')
    assert.equal(trace.length, 2)
    assert.equal(trace[0].requestId, trace[1].requestId)
    assert.equal(trace[0].attempt, 2)
    assert.equal(dashboard.overview.requests, 2)
    assert.equal(dashboard.overview.success, 1)
    assert.equal(dashboard.overview.otherErrors, 1)
    assert.equal(dashboard.overview.inputTokens, 5)
    assert.ok(!JSON.stringify(dashboard).includes('fake-first'))

    setup([provider('limited', 'rate_limited'), provider('backup')])
    await complete(request)
    await complete(request)
    assert.equal(calls.filter((id) => id === 'limited').length, 1)

    setup([provider('invalid', 'bad_request'), provider('untouched')])
    await assert.rejects(complete(request), LlmError)
    assert.deepEqual(calls, ['invalid'])

    setup([provider('ordinary'), provider('preferred')])
    assert.equal((await complete({ ...request, prefer: ['preferred'] })).providerId, 'preferred')
    const paid = provider('paid')
    process.env[paid.envPrefix] = 'fake-paid'
    PREMIUM_LLM_ADAPTERS.push(paid)
    resetRegistry()
    assert.ok((await llmStatus()).some((p) => p.id === 'paid'))
    assert.equal((await complete({ ...request, tier: 'premium' })).providerId, 'paid')

    setup([{ ...provider('misconfigured'), configurationIssue: () => 'missing account' }, provider('working')])
    assert.equal((await complete(request)).providerId, 'working')
    assert.deepEqual(calls, ['working'])

    cache.isAvailable = () => true
    cache.pipeline = async () => null
    dashboard = await getAiTokensDashboardData()
    assert.equal(dashboard.storage, 'degraded')
    assert.ok(dashboard.overview.requests > 0, 'Redis failure must retain local observations')
    cache.isAvailable = () => false

    const session = { uid: 1, email: 'test@example.invalid', name: 'old', role: 'admin' as const, exp: 9999999999 }
    const account = { id: 1, email: session.email, name: 'new', role: 'user', isActive: true, avatarUrl: null }
    assert.equal(reconcileSession(session, account)?.role, 'user')
    assert.equal(reconcileSession(session, { ...account, isActive: false }), null)
    assert.equal(reconcileSession(session, undefined), null)
    assert.equal(reconcileSession(session, { ...account, id: 2 }), null)
    assert.equal(reconcileSession(session, { ...account, email: 'different@example.invalid' }), null)
    assert.equal(typeof cloudflareAdapter.configurationIssue(), 'string')
    console.log('AI runtime, fallback, telemetry, provider configuration, and session revocation regressions passed.')
  } finally {
    LLM_ADAPTERS.splice(0, LLM_ADAPTERS.length, ...originals)
    PREMIUM_LLM_ADAPTERS.splice(0, PREMIUM_LLM_ADAPTERS.length, ...premium)
    cache.isAvailable = originalAvailable; cache.pipeline = originalPipeline
    resetRegistry(); resetLocalState()
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
