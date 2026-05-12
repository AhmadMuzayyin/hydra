"use server";

import { redirect } from "next/navigation";
import { createSession, destroySession, verifyPassword } from "@/lib/auth";
import type { Json } from "@/integrations/supabase/types";
import {
  deleteSchedule,
  saveSetting,
  setDeviceStatus,
  upsertSchedule,
  markScheduleSynced,
} from "@/lib/data";

const STATIC_USERNAME = "admin";
const STATIC_PASSWORD_HASH = "$2a$10$iVM9TFhpNsftPqoQZISkpOXUf8TY8XFp95QAMyGhE8R2QGVedu2q.";

export type LoginState = {
  error?: string;
};

export async function loginAction(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!username || !password) {
    return { error: "Username dan password wajib diisi" };
  }

  const ok =
    username === STATIC_USERNAME && (await verifyPassword(password, STATIC_PASSWORD_HASH));

  if (!ok) {
    return { error: "Username atau password salah" };
  }

  await createSession(username, "admin");
  redirect("/dashboard");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

export async function setDeviceStatusAction(input: { id: string; status: boolean }) {
  return setDeviceStatus(input);
}

export async function upsertScheduleAction(input: {
  id?: string;
  device_id: string;
  action: "ON" | "OFF";
  time_on: string;
  time_off: string;
  days: string[];
  enabled?: boolean;
}) {
  return upsertSchedule(input);
}

export async function deleteScheduleAction(input: { id: string }) {
  return deleteSchedule(input);
}

export async function markScheduleSyncedAction(input: { id: string; synced: boolean }) {
  return markScheduleSynced(input);
}

export async function saveSettingAction(input: { key: string; value: unknown }) {
  return saveSetting({ key: input.key, value: input.value as Json });
}
