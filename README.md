# Hydra Next

Monitoring dan kontrol tandon air versi Next.js dengan Supabase, MQTT, dan App Router.

## Development

Pastikan Node aktif via `nvm` lalu jalankan:

```bash
nvm use lts/jod
npm install
npm run dev
```

## Build & Check

```bash
nvm use lts/jod
npm run lint
npm run build
```

## Environment

File `.env` di root project berisi konfigurasi Supabase dan auth. Variabel yang dipakai:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `AUTH_SECRET`

## Deploy

Project ini sudah disiapkan untuk deployment ke Vercel dengan Next.js App Router. Pastikan semua environment variable di atas tersedia di Vercel sebelum deploy.
