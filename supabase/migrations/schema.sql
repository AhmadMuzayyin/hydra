-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.devices (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  device_id text NOT NULL UNIQUE CHECK (device_id = ANY (ARRAY['pump'::text, 'valve'::text])),
  name text NOT NULL,
  topic_cmd text NOT NULL UNIQUE,
  topic_status text NOT NULL UNIQUE,
  device_type text NOT NULL DEFAULT 'relay'::text CHECK (device_type = ANY (ARRAY['pump'::text, 'valve'::text, 'relay'::text])),
  status boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT true,
  last_seen_at timestamp with time zone,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT devices_pkey PRIMARY KEY (id)
);
CREATE TABLE public.schedules (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL,
  action text NOT NULL CHECK (action = ANY (ARRAY['ON'::text, 'OFF'::text])),
  time_on time without time zone NOT NULL,
  time_off time without time zone NOT NULL,
  days jsonb NOT NULL DEFAULT '["mon", "tue", "wed", "thu", "fri", "sat", "sun"]'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  synced boolean DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT schedules_pkey PRIMARY KEY (id),
  CONSTRAINT schedules_device_id_fkey FOREIGN KEY (device_id) REFERENCES public.devices(id)
);
CREATE TABLE public.settings (
  key text NOT NULL,
  value jsonb NOT NULL,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT settings_pkey PRIMARY KEY (key)
);
CREATE TABLE public.telemetry (
  id bigint NOT NULL DEFAULT nextval('telemetry_id_seq'::regclass),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  device_uuid text NOT NULL,
  level_primary_cm numeric,
  level_primary_pct numeric,
  level_min_triggered boolean NOT NULL DEFAULT false,
  pump_on boolean NOT NULL DEFAULT false,
  pump_runtime_sec integer,
  valve_on boolean NOT NULL DEFAULT false,
  valve_runtime_sec integer,
  led_green1_state boolean,
  led_green2_state boolean,
  led_red1_state boolean,
  led_red2_state boolean,
  wifi_rssi integer,
  free_heap integer,
  temperature_c numeric,
  uptime_sec integer,
  payload jsonb,
  CONSTRAINT telemetry_pkey PRIMARY KEY (id)
);

INSERT INTO "public"."devices" ("id", "device_id", "name", "topic_cmd", "topic_status", "device_type", "status", "enabled", "last_seen_at", "metadata", "created_at", "updated_at") VALUES ('9b32a6fc-9980-4f84-9532-1dd0af47f0c2', 'pump', 'Pompa Air', 'tandon/pump/cmd', 'tandon/pump/status', 'pump', false, true, null, '{"label": "Pompa Utama", "relay_pin": "D1"}', '2026-05-09 15:13:57.472649+00', '2026-05-09 15:13:57.472649+00'), ('bddb1a13-0676-4476-adb5-9f515bbfe914', 'valve', 'Selenoid Valve', 'tandon/valve/cmd', 'tandon/valve/status', 'valve', false, true, null, '{"label": "Katup Selenoid", "relay_pin": "D2"}', '2026-05-09 15:13:57.472649+00', '2026-05-09 15:13:57.472649+00');

INSERT INTO "public"."settings" ("key", "value", "updated_at") VALUES ('device_info', '{"name": "Sistem Monitoring Tangki", "location": "PP Annuqayah Lubangsa", "device_uuid": "esp-hydra-001"}', '2026-05-09 15:16:23.032+00'), ('mqtt_config', '{"host": "d8e662e1.ala.asia-southeast1.emqxsl.com", "path": "/mqtt", "port": 8883, "password": "Mocachino18@", "username": "ustad.dev"}', '2026-05-09 15:13:57.472649+00'), ('ota_config', '{"channel": "stable", "enabled": true}', '2026-05-09 15:13:57.472649+00'), ('tank_config', '{"level_min_cm": 30, "level_full_cm": 180, "buzzer_enabled": true, "tank_height_cm": 200, "pump_on_threshold": 50, "pump_off_threshold": 180, "valve_open_threshold": 190}', '2026-05-09 15:13:57.472649+00'), ('telemetry_config', '{"retention_days": 30, "poll_interval_sec": 5, "telemetry_interval_sec": 10}', '2026-05-09 15:13:57.472649+00'), ('wifi_config', '{"ssid": "USTDEV", "password": "coba12345"}', '2026-05-12 09:41:22.896+00');

