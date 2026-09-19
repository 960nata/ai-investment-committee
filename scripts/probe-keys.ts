/**
 * Skrip Probe Kunci API
 *
 * Memeriksa status hidup/mati dari seluruh API key yang ada di .env.local
 * tanpa mengekspos isi kunci ke log / stdout (hanya menampilkan nama variabel & 4 karakter akhir).
 * Panggilan menggunakan endpoint cek status/model ringan agar tidak boros kuota token.
 */

import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

interface KeyEntry {
  provider: 'gemini' | 'groq' | 'openrouter' | 'mistral' | 'deepseek' | 'nvidia' | 'github'
  envName: string
  key: string
}

interface ProbeResult {
  envName: string
  provider: string
  masked: string
  status: 'ACTIVE' | 'RATE_LIMITED' | 'DEAD' | 'ERROR'
  httpCode?: number
  message: string
  latencyMs: number
}

function parseEnv(path: string): Record<string, string> {
  if (!existsSync(path)) return {}
  const content = readFileSync(path, 'utf8')
  const out: Record<string, string> = {}
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let val = trimmed.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    } else {
      const hash = val.indexOf(' #')
      if (hash !== -1) val = val.slice(0, hash).trim()
    }
    out[key] = val
  }
  return out
}

async function probeGemini(key: string): Promise<{ status: ProbeResult['status']; code?: number; message: string }> {
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`, {
      signal: AbortSignal.timeout(10000),
    })
    if (res.ok) return { status: 'ACTIVE', code: res.status, message: 'OK (Models accessible)' }
    if (res.status === 429) return { status: 'RATE_LIMITED', code: res.status, message: 'Rate Limited (Quota exceeded)' }
    if (res.status === 400 || res.status === 403) return { status: 'DEAD', code: res.status, message: 'Invalid / Dead Key' }
    return { status: 'ERROR', code: res.status, message: `HTTP ${res.status}` }
  } catch (err) {
    return { status: 'ERROR', message: err instanceof Error ? err.message : String(err) }
  }
}

async function probeGroq(key: string): Promise<{ status: ProbeResult['status']; code?: number; message: string }> {
  try {
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10000),
    })
    if (res.ok) return { status: 'ACTIVE', code: res.status, message: 'OK' }
    if (res.status === 429) return { status: 'RATE_LIMITED', code: res.status, message: 'Rate Limited' }
    if (res.status === 401 || res.status === 403) return { status: 'DEAD', code: res.status, message: 'Invalid / Expired' }
    return { status: 'ERROR', code: res.status, message: `HTTP ${res.status}` }
  } catch (err) {
    return { status: 'ERROR', message: err instanceof Error ? err.message : String(err) }
  }
}

async function probeOpenRouter(key: string): Promise<{ status: ProbeResult['status']; code?: number; message: string }> {
  try {
    const res = await fetch('https://openrouter.ai/api/v1/auth/key', {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10000),
    })
    if (res.ok) {
      const json = await res.json() as { data?: { label?: string; limit?: number; usage?: number } }
      const label = json.data?.label ? ` (${json.data.label})` : ''
      return { status: 'ACTIVE', code: res.status, message: `OK${label}` }
    }
    if (res.status === 429) return { status: 'RATE_LIMITED', code: res.status, message: 'Rate Limited' }
    if (res.status === 401 || res.status === 403) return { status: 'DEAD', code: res.status, message: 'Invalid / Expired' }
    return { status: 'ERROR', code: res.status, message: `HTTP ${res.status}` }
  } catch (err) {
    return { status: 'ERROR', message: err instanceof Error ? err.message : String(err) }
  }
}

async function probeMistral(key: string): Promise<{ status: ProbeResult['status']; code?: number; message: string }> {
  try {
    const res = await fetch('https://api.mistral.ai/v1/models', {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10000),
    })
    if (res.ok) return { status: 'ACTIVE', code: res.status, message: 'OK' }
    if (res.status === 429) return { status: 'RATE_LIMITED', code: res.status, message: 'Rate Limited' }
    if (res.status === 401 || res.status === 403) return { status: 'DEAD', code: res.status, message: 'Invalid / Expired' }
    return { status: 'ERROR', code: res.status, message: `HTTP ${res.status}` }
  } catch (err) {
    return { status: 'ERROR', message: err instanceof Error ? err.message : String(err) }
  }
}

async function probeDeepSeek(key: string): Promise<{ status: ProbeResult['status']; code?: number; message: string }> {
  try {
    const res = await fetch('https://api.deepseek.com/models', {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10000),
    })
    if (res.ok) return { status: 'ACTIVE', code: res.status, message: 'OK' }
    if (res.status === 429) return { status: 'RATE_LIMITED', code: res.status, message: 'Rate Limited' }
    if (res.status === 401 || res.status === 403) return { status: 'DEAD', code: res.status, message: 'Invalid / Expired / Balance Insufficient' }
    return { status: 'ERROR', code: res.status, message: `HTTP ${res.status}` }
  } catch (err) {
    return { status: 'ERROR', message: err instanceof Error ? err.message : String(err) }
  }
}

async function probeNvidia(key: string): Promise<{ status: ProbeResult['status']; code?: number; message: string }> {
  try {
    const res = await fetch('https://integrate.api.nvidia.com/v1/models', {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10000),
    })
    if (res.ok) return { status: 'ACTIVE', code: res.status, message: 'OK' }
    if (res.status === 429) return { status: 'RATE_LIMITED', code: res.status, message: 'Rate Limited' }
    if (res.status === 401 || res.status === 403) return { status: 'DEAD', code: res.status, message: 'Invalid / Expired' }
    return { status: 'ERROR', code: res.status, message: `HTTP ${res.status}` }
  } catch (err) {
    return { status: 'ERROR', message: err instanceof Error ? err.message : String(err) }
  }
}

async function probeGitHub(key: string): Promise<{ status: ProbeResult['status']; code?: number; message: string }> {
  try {
    const res = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${key}`,
        'User-Agent': 'investasi-probe',
      },
      signal: AbortSignal.timeout(10000),
    })
    if (res.ok) {
      const user = await res.json() as { login?: string }
      return { status: 'ACTIVE', code: res.status, message: `OK (User: ${user.login ?? 'valid'})` }
    }
    if (res.status === 401 || res.status === 403) return { status: 'DEAD', code: res.status, message: 'Bad Credentials' }
    return { status: 'ERROR', code: res.status, message: `HTTP ${res.status}` }
  } catch (err) {
    return { status: 'ERROR', message: err instanceof Error ? err.message : String(err) }
  }
}

async function main() {
  const env = parseEnv(resolve(process.cwd(), '.env.local'))
  const entries: KeyEntry[] = []

  for (const [keyName, val] of Object.entries(env)) {
    if (!val || val.startsWith('<')) continue
    if (keyName.startsWith('GEMINI_API_KEY')) {
      entries.push({ provider: 'gemini', envName: keyName, key: val })
    } else if (keyName.startsWith('GROQ_API_KEY')) {
      entries.push({ provider: 'groq', envName: keyName, key: val })
    } else if (keyName.startsWith('OPENROUTER_API_KEY')) {
      entries.push({ provider: 'openrouter', envName: keyName, key: val })
    } else if (keyName === 'MISTRAL_API_KEY') {
      entries.push({ provider: 'mistral', envName: keyName, key: val })
    } else if (keyName === 'DEEPSEEK_API_KEY') {
      entries.push({ provider: 'deepseek', envName: keyName, key: val })
    } else if (keyName === 'NVIDIA_API_KEY') {
      entries.push({ provider: 'nvidia', envName: keyName, key: val })
    } else if (keyName === 'GITHUB_TOKEN') {
      entries.push({ provider: 'github', envName: keyName, key: val })
    }
  }

  console.log(`\n🔍 Memeriksa ${entries.length} kunci API dari .env.local...\n`)

  const results: ProbeResult[] = []

  for (const entry of entries) {
    const masked = `...${entry.key.slice(-4)}`
    const t0 = Date.now()
    let res: { status: ProbeResult['status']; code?: number; message: string }

    if (entry.provider === 'gemini') res = await probeGemini(entry.key)
    else if (entry.provider === 'groq') res = await probeGroq(entry.key)
    else if (entry.provider === 'openrouter') res = await probeOpenRouter(entry.key)
    else if (entry.provider === 'mistral') res = await probeMistral(entry.key)
    else if (entry.provider === 'deepseek') res = await probeDeepSeek(entry.key)
    else if (entry.provider === 'nvidia') res = await probeNvidia(entry.key)
    else if (entry.provider === 'github') res = await probeGitHub(entry.key)
    else res = { status: 'ERROR', message: 'Unknown provider' }

    const latencyMs = Date.now() - t0
    const icon = res.status === 'ACTIVE' ? '✅' : res.status === 'RATE_LIMITED' ? '⏳' : '❌'

    console.log(`${icon} [${entry.provider.toUpperCase()}] ${entry.envName.padEnd(23)} (${masked}): ${res.status.padEnd(12)} (${res.message}) [${latencyMs}ms]`)

    results.push({
      envName: entry.envName,
      provider: entry.provider,
      masked,
      status: res.status,
      httpCode: res.code,
      message: res.message,
      latencyMs,
    })

    // small delay to avoid hammering
    await new Promise((r) => setTimeout(r, 80))
  }

  console.log('\n========================================')
  console.log('📊 RINGKASAN STATUS KUNCI:')
  console.log('========================================')

  const byProvider: Record<string, { total: number; active: number; rateLimited: number; dead: number }> = {}

  for (const r of results) {
    if (!byProvider[r.provider]) {
      byProvider[r.provider] = { total: 0, active: 0, rateLimited: 0, dead: 0 }
    }
    byProvider[r.provider].total++
    if (r.status === 'ACTIVE') byProvider[r.provider].active++
    else if (r.status === 'RATE_LIMITED') byProvider[r.provider].rateLimited++
    else byProvider[r.provider].dead++
  }

  for (const [p, s] of Object.entries(byProvider)) {
    console.log(`- ${p.toUpperCase().padEnd(12)}: Total ${s.total} | Aktif: ${s.active} | Rate-Limited: ${s.rateLimited} | Mati: ${s.dead}`)
  }

  const activeKeys = results.filter((r) => r.status === 'ACTIVE')
  console.log(`\n✨ Total Kunci Aktif Siap Pakai: ${activeKeys.length} / ${results.length}\n`)
}

main().catch((err) => {
  console.error('Fatal probe error:', err)
})
