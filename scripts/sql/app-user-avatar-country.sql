-- Kolom app_user yang sudah ada di lib/db/schema.ts tetapi belum ada di basis
-- data. Tanpa keduanya, upsert di /api/v1/auth/google gagal dan pengguna
-- melihat "Gagal menyimpan sesi pengguna". Keduanya nullable, jadi aman
-- dijalankan ulang dan tidak menyentuh baris yang sudah ada.
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS country varchar(4);
