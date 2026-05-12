# Hydra

Aplikasi web untuk monitoring dan kontrol tandon air. Sistem ini memakai Next.js, Supabase, dan MQTT untuk sinkronisasi data, kontrol relay, dan jadwal perangkat.

## Install

```bash
npm install
npm run dev
```

## Build

```bash
npm run lint
npm run build
```

## Environment

Tambahkan file `.env` di root project dengan variabel berikut:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `AUTH_SECRET`
