import './load-env'
import postgres from 'postgres'
async function main() {
  const sql = postgres(process.env.DIRECT_URL!, { max: 1, connect_timeout: 15 })
  const r = await sql<{ n: number; lo: string; i: number }[]>`
    select count(*)::int as n, min(date)::text as lo, count(distinct instrument_id)::int as i
    from candle_daily c join instrument i on i.id=c.instrument_id where i.market='us'
  `
  console.log(`  ${r[0].n.toLocaleString('id-ID')} baris, ${r[0].i} instrumen, sejak ${r[0].lo}`)
  await sql.end()
}
main().catch(e => console.error(e.message))
