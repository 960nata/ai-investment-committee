import assert from 'node:assert/strict'
import { LLM_ADAPTERS, PREMIUM_LLM_ADAPTERS } from '../lib/ai/adapters'
import { complete, resetRegistry, llmStatus, AllProvidersFailedError } from '../lib/ai/registry'
import { LlmError, type LlmAdapter } from '../lib/ai/types'
import { getAiTokensDashboardData, TelemetryUnavailableError } from '../lib/ai/telemetry'
import { resetLocalState } from '../lib/ai/keyring'
import { reconcileSession } from '../lib/auth/verified-session'
import { cache } from '../lib/cache/redis'
import { cloudflareAdapter } from '../lib/ai/providers/cloudflare'
import { factsToPrompt, type MarketFacts } from '../lib/agents/facts'
import { applyGuard, formatCheckTurn, parseCheck, parseCheckTurn, ruleFindings, untracedNumbers } from '../lib/agents/guard'

async function main() {
  const reportFacts = {
    symbol: 'TEST', name: 'Test Corp', market: 'US', currency: 'USD', asOf: '2026-10-02',
    staleDays: 1, candleCount: 300, historyStart: '2025-08-01', historyYears: 1,
    lastClose: 100, returns: { d1: null, d7: null, d30: null, d90: null, d365: null, y2: null, y3: null, y5: null },
    annualisedVolatility: null, volatilityFullHistory: null, maxDrawdown: null,
    maxDrawdownFullHistory: null, range52w: null, historyHigh: null,
    sma: { s20: null, s50: null, s200: null }, sma200SlopePct: null,
    priceVsSma50Pct: null, trend: 'tidak cukup data', volumeRatio20v100: null,
    monthly: [], yearly: [], warnings: [],
    financialReport: {
      period: '2026-Q2', periodEnd: '2026-06-30', reportedAt: '2026-08-01',
      sourceId: 'sec-edgar', accession: '0000000000-26-000001', currency: 'USD',
      completeness: 0.8, items: { pendapatan: 1000000, laba_bersih: -100000 },
      missingItems: ['arus_kas_operasi'],
    },
  } satisfies MarketFacts
  const reportPrompt = factsToPrompt(reportFacts, 'summary')
  assert.ok(reportPrompt.includes('terbit 2026-08-01; sumber sec-edgar; accession 0000000000-26-000001'))
  assert.ok(reportPrompt.includes('Laba bersih: USD -100.000'))
  assert.ok(reportPrompt.includes('Arus kas operasi: tidak tersedia'))
  assert.ok(reportPrompt.includes('Pos wajib yang tidak tersedia: arus_kas_operasi'))

  // Pemeriksa putusan: hanya menurunkan, tidak pernah menaikkan atau membalik arah.
  const factsText = 'Imbal hasil 30 hari: 12,34%. Harga terakhir: IDR 1.234,5. Volatilitas 1 tahun: 28,1%.'
  assert.deepEqual(untracedNumbers('naik 12,3% dari 1.234,5 dengan volatilitas 28,1%', factsText), [])
  assert.deepEqual(untracedNumbers('naik 45,6% dalam 3 kategori sejak 2026', factsText), ['45,6%'])
  const ketua = { verdict: 'beli' as const, confidence: 82, rationale: 'Bukti condong positif.', key_risk: '', invalidation: '' }
  const longFacts = { ...reportFacts, historyYears: 3 }
  const clean = ruleFindings(ketua, longFacts, factsText)
  assert.equal(clean.shortHistory, false)
  assert.deepEqual(ruleFindings({ ...ketua, rationale: 'Saatnya membeli.' }, longFacts, factsText).bannedWords, ['membeli'])
  assert.deepEqual(applyGuard(ketua, clean, { supported: true, max_confidence: 90, issues: [] }), { verdict: 'beli', confidence: 82, note: '' })
  assert.equal(applyGuard(ketua, clean, { supported: true, max_confidence: 65, issues: [] }).confidence, 65)
  const disputed = applyGuard(ketua, clean, { supported: false, max_confidence: 70, issues: ['tren turun'] }, 'groq')
  assert.equal(disputed.verdict, 'tahan')
  assert.equal(disputed.confidence, 40)
  assert.ok(disputed.note.includes('groq') && disputed.note.includes('tren turun'))
  assert.equal(applyGuard({ ...ketua, verdict: 'jual' }, clean, { supported: false, max_confidence: 0, issues: [] }).verdict, 'tahan')
  const unchecked = applyGuard(ketua, clean, null)
  assert.equal(unchecked.verdict, 'beli')
  assert.equal(unchecked.confidence, 60)
  assert.equal(applyGuard(ketua, ruleFindings(ketua, { ...reportFacts, historyYears: 0.5 }, factsText), { supported: true, max_confidence: 90, issues: [] }).confidence, 39)
  assert.deepEqual(applyGuard({ ...ketua, verdict: 'abstain', confidence: 0 }, clean, null), { verdict: 'abstain', confidence: 0, note: '' })
  assert.equal(applyGuard({ ...ketua, confidence: 30 }, clean, null).note, '')
  assert.deepEqual(parseCheck('```json\n{"supported":"false","max_confidence":"55.4","issues":["x"],}\n```'), { supported: false, max_confidence: 55, issues: ['x'] })
  assert.equal(parseCheck('{"supported":true,"max_confidence":140}'), null)
  assert.equal(parseCheck('tidak ada JSON'), null)
  const stored = { supported: false, max_confidence: 35, issues: ['angka karangan', 'keberatan tidak dijawab'] }
  assert.deepEqual(parseCheckTurn(formatCheckTurn(clean, stored)), stored)

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
    const fallbackRes = await complete(request)
    assert.equal(fallbackRes.providerId, 'untouched')
    assert.deepEqual(calls, ['invalid', 'untouched'])

    setup([provider('invalid_only', 'bad_request')])
    await assert.rejects(complete(request), AllProvidersFailedError)

    setup([provider('ordinary'), provider('preferred')])
    assert.equal((await complete({ ...request, prefer: ['preferred'] })).providerId, 'preferred')
    calls.length = 0
    assert.equal((await complete({ ...request, prefer: ['preferred'], exclude: ['preferred'] })).providerId, 'ordinary')
    assert.deepEqual(calls, ['ordinary'])
    await assert.rejects(complete({ ...request, exclude: ['ordinary', 'preferred'] }), AllProvidersFailedError)
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
    // Penyegaran berkala menolak angka memori (lihat c9e9bc2); muatan pertama menerimanya.
    await assert.rejects(getAiTokensDashboardData(), TelemetryUnavailableError)
    dashboard = await getAiTokensDashboardData('24h', { allowMemoryFallback: true })
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
