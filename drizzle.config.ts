import './scripts/load-env'

import { defineConfig } from 'drizzle-kit'

// Migrasi memakai koneksi langsung (port 5432), bukan pooler — drizzle-kit
// butuh prepared statement dan DDL yang tidak jalan lewat pgBouncer.
export default defineConfig({
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL!,
  },
})
