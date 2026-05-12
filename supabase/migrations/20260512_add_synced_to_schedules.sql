-- Migration: add `synced` boolean to schedules
BEGIN;
ALTER TABLE public.schedules
  ADD COLUMN IF NOT EXISTS synced boolean DEFAULT false;
COMMIT;

-- Optional: backfill logic if you want existing schedules considered synced
-- UPDATE public.schedules SET synced = true WHERE /* condition */;
