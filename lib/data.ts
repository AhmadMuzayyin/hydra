import "server-only";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";
import { requireAdmin, requireUser } from "./auth";

export async function listDevices() {
  await requireUser();
  const { data } = await supabaseAdmin
    .from("devices")
    .select("*")
    .order("created_at", { ascending: true });
  return data ?? [];
}

export async function setDeviceStatus(input: { id: string; status: boolean }) {
  await requireUser();
  await supabaseAdmin.from("devices").update({ status: input.status }).eq("id", input.id);
  return { ok: true };
}

export async function listSchedules() {
  await requireUser();
  const { data } = await supabaseAdmin
    .from("schedules")
    .select("*, devices(name)")
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function upsertSchedule(input: {
  id?: string;
  device_id: string;
  action: "ON" | "OFF";
  time_on: string;
  time_off: string;
  days: string[];
  enabled?: boolean;
}) {
  await requireUser();
  const payload = {
    id: input.id,
    device_id: input.device_id,
    action: input.action,
    time_on: input.time_on,
    time_off: input.time_off,
    days: input.days,
    enabled: input.enabled ?? true,
    // mark as not yet synced to device; will be set true after device ack
    synced: false,
  };

  if (input.id) {
    await supabaseAdmin
      .from("schedules")
      .update(payload as never)
      .eq("id", input.id);
  } else {
    const inserted = await supabaseAdmin
      .from("schedules")
      .insert(payload as never)
      .select("id")
      .single();

    return { ok: true, id: inserted.data?.id };
  }

  return { ok: true };
}

export async function markScheduleSynced(input: { id: string; synced: boolean }) {
  await requireUser();
  await supabaseAdmin
    .from("schedules")
    .update({ synced: input.synced } as never)
    .eq("id", input.id);
  return { ok: true };
}

export async function deleteSchedule(input: { id: string }) {
  await requireUser();
  await supabaseAdmin.from("schedules").delete().eq("id", input.id);
  return { ok: true };
}

export async function getSettings() {
  await requireUser();
  const { data } = await supabaseAdmin.from("settings").select("*");
  const out: Record<string, Json> = {};
  for (const row of data ?? []) {
    out[row.key] = row.value;
  }
  return out;
}

export async function saveSetting(input: { key: string; value: Json }) {
  await requireAdmin();
  await supabaseAdmin
    .from("settings")
    .upsert({ key: input.key, value: input.value, updated_at: new Date().toISOString() });
  return { ok: true };
}
