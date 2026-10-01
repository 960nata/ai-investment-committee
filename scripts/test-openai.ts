import './load-env'
import OpenAI from 'openai'

const apiKey = process.env.OPENAI_API_KEY

if (!apiKey) {
  console.error('Error: OPENAI_API_KEY tidak ditemukan di .env atau environment variable.')
  process.exit(1)
}

const openai = new OpenAI({
  apiKey,
})

async function main() {
  console.log('Menguji model gpt-6-luna via OpenAI Responses API...')
  try {
    const response = await openai.responses.create({
      model: process.env.OPENAI_MODEL || 'gpt-6-luna',
      input: 'write a haiku about ai',
      store: true,
    })

    console.log('\n--- Hasil Haiku ---')
    console.log(response.output_text)
    console.log('-------------------\n')
    console.log('ID Respon:', response.id)
    console.log('Model:', response.model)
    console.log('Total Tokens:', response.usage?.total_tokens)
  } catch (err) {
    console.error('Gagal memanggil OpenAI Responses API:', err)
  }
}

main()
