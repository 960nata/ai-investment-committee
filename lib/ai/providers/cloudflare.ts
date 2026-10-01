import { createOpenAiCompatibleAdapter } from './openai-compatible'

export const cloudflareAdapter = {
  ...createOpenAiCompatibleAdapter({
    id: 'cloudflare',
    name: 'Cloudflare Workers AI',
    baseUrl: `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID ?? ''}/ai/v1`,
    model: process.env.CLOUDFLARE_AI_MODEL || '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    envPrefix: 'CLOUDFLARE_API_TOKEN',
  }),
  configurationIssue: () => /^[a-f0-9]{32}$/i.test(process.env.CLOUDFLARE_ACCOUNT_ID ?? '')
    ? null : 'CLOUDFLARE_ACCOUNT_ID belum diisi atau tidak valid',
}
