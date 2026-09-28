/**
 * Jadikan satu akun admin, sekaligus pasang kata sandi barunya.
 *
 *   npm run admin:make -- surel@contoh.com
 *   npm run admin:make -- surel@contoh.com --password "kata sandi pilihan"
 *
 * Akun yang belum ada dibuat; yang sudah ada dinaikkan jadi admin dan kata
 * sandinya diganti. Tanpa `--password`, kata sandi acak dibuat dan dicetak
 * sekali di terminal. Kata sandi tidak pernah ditulis ke berkas mana pun di
 * repo: yang tersimpan hanya hash-nya, di basis data.
 */

import './load-env'
import crypto from 'node:crypto'
import postgres from 'postgres'
import { hashPassword } from '../lib/auth/user-auth'

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag)
  return i === -1 ? undefined : process.argv[i + 1]
}

async function main(): Promise<void> {
  const email = process.argv.slice(2).find((a) => !a.startsWith('--') && a !== argValue('--password'))
  if (!email || !email.includes('@')) {
    throw new Error('Surel wajib diisi: npm run admin:make -- surel@contoh.com')
  }

  const normalized = email.trim().toLowerCase()
  const password = argValue('--password') ?? crypto.randomBytes(12).toString('base64url')
  const passwordHash = await hashPassword(password)

  const sql = postgres(process.env.DIRECT_URL || process.env.DATABASE_URL!, { max: 1, connect_timeout: 20 })

  try {
    const [user] = await sql<{ id: number; created: boolean }[]>`
      insert into app_user (email, name, role, password_hash, is_active)
      values (${normalized}, 'Admin', 'admin', ${passwordHash}, true)
      on conflict (email) do update
        set role = 'admin', password_hash = excluded.password_hash, is_active = true
      returning id, (xmax = 0) created`

    console.log(`\n${user.created ? 'Akun dibuat' : 'Akun diperbarui'} · id ${user.id}`)
    console.log(`  surel       ${normalized}`)
    console.log(`  peran       admin`)
    console.log(`  kata sandi  ${password}\n`)
  } finally {
    await sql.end()
  }
}

main().catch((error) => {
  console.error(`\nGagal: ${error instanceof Error ? error.message : error}\n`)
  process.exit(1)
})
