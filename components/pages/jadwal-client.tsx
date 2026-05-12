"use client";

import { useState } from "react";
import { Clock, Plus, Trash2 } from "lucide-react";
import { MobileLayout } from "@/components/mobile-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  deleteScheduleAction,
  upsertScheduleAction,
  markScheduleSyncedAction,
} from "@/app/actions";
import { useMqtt, type MqttConfig } from "@/hooks/use-mqtt";

const DAYS = [
  { k: "mon", l: "Sen" },
  { k: "tue", l: "Sel" },
  { k: "wed", l: "Rab" },
  { k: "thu", l: "Kam" },
  { k: "fri", l: "Jum" },
  { k: "sat", l: "Sab" },
  { k: "sun", l: "Min" },
] as const;

type DayKey = (typeof DAYS)[number]["k"];

type DeviceRow = {
  id: string;
  name: string;
  topic?: string;
  device_id?: string;
};

type ScheduleRow = {
  id: string;
  device_id: string | null;
  action?: "ON" | "OFF";
  time_on: string;
  time_off: string;
  days?: unknown;
  enabled: boolean;
  synced?: boolean;
  devices?: {
    name: string;
    topic?: string;
  } | null;
};

type ScheduleForm = {
  id?: string;
  device_id: string;
  action: "ON" | "OFF";
  time_on: string;
  time_off: string;
  days: string[];
  enabled: boolean;
};

export function JadwalClient({
  userRole,
  schedules,
  devices,
  mqttConfig,
}: {
  userRole?: string;
  schedules: ScheduleRow[];
  devices: DeviceRow[];
  mqttConfig?: MqttConfig;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ScheduleForm>({
    id: undefined,
    device_id: devices?.[0]?.id ?? "",
    action: "ON",
    time_on: "06:00",
    time_off: "06:30",
    days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
    enabled: true,
  });

  const reset = () =>
    setForm({
      id: undefined,
      device_id: devices?.[0]?.id ?? "",
      action: "ON",
      time_on: "06:00",
      time_off: "06:30",
      days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
      enabled: true,
    });

  // instantiate mqtt hook (must be at top-level)
  const mqtt = useMqtt(mqttConfig);

  const submit = async () => {
    if (!form.device_id) return window.alert("Pilih perangkat");
    if (!isTimeValid())
      return window.alert(
        "Waktu selesai harus lebih besar atau sama dengan waktu mulai",
      );
    try {
      // save to DB first (source of truth)
      const result = await upsertScheduleAction(form);
      const scheduleId = form.id ?? result?.id;
      if (!scheduleId) {
        throw new Error("missing-schedule-id");
      }

      // attempt to push to device and wait for ack
      try {
        const device = devices.find((d) => d.id === form.device_id);
        const topic = device?.topic ?? `device/${form.device_id}/schedule/set`;
        const deviceField = device?.device_id ?? device?.id ?? form.device_id;
        const ackTopic = device?.topic
          ? `${device.topic}/schedule/ack`
          : `device/${form.device_id}/schedule/ack`;
        const payload = JSON.stringify({
          op: "add",
          id: scheduleId,
          time_on: form.time_on,
          time_off: form.time_off,
          days: form.days,
          device: deviceField,
        });

        const ackPromise = new Promise<boolean>((resolve, reject) => {
          const handler = (_t: string, message: string) => {
            try {
              const m = JSON.parse(message);
              if (
                m?.id === scheduleId &&
                m?.op === "add" &&
                (m.status === "ok" || m.status === "synced")
              ) {
                mqtt.unsubscribe(ackTopic, handler);
                clearTimeout(timeoutId);
                resolve(true);
              }
            } catch {
              // ignore parse errors
            }
          };

          mqtt.subscribe(ackTopic, handler);

          const timeoutId = setTimeout(() => {
            try {
              mqtt.unsubscribe(ackTopic, handler);
            } catch {}
            reject(new Error("no-ack"));
          }, 5000);
        });

        // publish
        mqtt.publish(topic, payload as unknown as string);

        // wait but don't block UI too long
        const ackResult = await ackPromise.catch(() => {
          // ignore ack failure here; we'll mark as pending in UI via toast
          return false as const;
        });

        if (ackResult !== false) {
          // mark synced in DB
          try {
            await markScheduleSyncedAction({ id: scheduleId, synced: true });
          } catch {}
        }
      } catch (e) {
        // publish failed, proceed but inform user
      }

      setOpen(false);
      reset();
      window.location.reload();
    } catch {
      window.alert("Gagal menyimpan jadwal");
    }
  };

  const toggleDay = (key: DayKey) =>
    setForm((prev) => ({
      ...prev,
      days: prev.days.includes(key)
        ? prev.days.filter((day) => day !== key)
        : [...prev.days, key],
    }));

  const isTimeValid = () => {
    // Validasi: time_off harus >= time_on (format HH:MM)
    const [hourOn, minOn] = form.time_on.split(":").map(Number);
    const [hourOff, minOff] = form.time_off.split(":").map(Number);

    if (hourOff < hourOn) return false;
    if (hourOff === hourOn && minOff < minOn) return false;
    return true;
  };

  return (
    <MobileLayout title="Jadwal" role={userRole}>
      <div className="mb-3 flex justify-end">
        <Dialog
          open={open}
          onOpenChange={(value) => {
            setOpen(value);
            if (value) reset();
          }}
        >
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" /> Jadwal
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{form.id ? "Edit" : "Tambah"} Jadwal</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Perangkat</Label>
                <Select
                  value={form.device_id}
                  onValueChange={(value) =>
                    setForm({ ...form, device_id: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih perangkat" />
                  </SelectTrigger>
                  <SelectContent>
                    {devices.map((device) => (
                      <SelectItem key={device.id} value={device.id}>
                        {device.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Aksi</Label>
                <Select
                  value={form.action}
                  onValueChange={(value: "ON" | "OFF") =>
                    setForm({ ...form, action: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih aksi" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ON">ON</SelectItem>
                    <SelectItem value="OFF">OFF</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Mulai</Label>
                  <Input
                    type="time"
                    value={form.time_on}
                    onChange={(event) =>
                      setForm({ ...form, time_on: event.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>Selesai</Label>
                  <Input
                    type="time"
                    value={form.time_off}
                    onChange={(event) =>
                      setForm({ ...form, time_off: event.target.value })
                    }
                  />
                  {!isTimeValid() && (
                    <p className="text-xs text-destructive mt-1">
                      Selesai harus ≥ Mulai
                    </p>
                  )}
                </div>
              </div>

              <div>
                <Label>Hari</Label>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {DAYS.map((day) => (
                    <button
                      key={day.k}
                      type="button"
                      onClick={() => toggleDay(day.k)}
                      className={`h-10 w-10 rounded-full text-xs font-semibold transition ${form.days.includes(day.k) ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                    >
                      {day.l}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <Label>Aktif</Label>
                <Switch
                  checked={form.enabled}
                  onCheckedChange={(value) =>
                    setForm({ ...form, enabled: value })
                  }
                />
              </div>

              <Button
                onClick={submit}
                className="w-full"
                disabled={!isTimeValid()}
              >
                Simpan
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-3">
        {schedules.map((schedule) => (
          <div
            key={schedule.id}
            className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[var(--gradient-primary)] text-primary-foreground">
                  <Clock className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <p className="truncate font-semibold">
                    {schedule.devices?.name ?? "—"}
                  </p>
                  <p className="font-mono text-sm">
                    {schedule.action} • {String(schedule.time_on).slice(0, 5)} →{" "}
                    {String(schedule.time_off).slice(0, 5)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full px-2 py-1 text-xs font-semibold ${schedule.enabled ? "bg-accent/15 text-accent" : "bg-muted text-muted-foreground"}`}
                >
                  {schedule.enabled ? "Aktif" : "Off"}
                </span>
                <span
                  className={`rounded-full px-2 py-1 text-xs font-semibold ${schedule.synced ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-800"}`}
                >
                  {schedule.synced ? "Synced" : "Pending"}
                </span>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-1">
              {DAYS.map((day) => (
                <span
                  key={day.k}
                  className={`rounded-full px-2 py-0.5 text-[10px] ${normalizeDays(schedule.days).includes(day.k) ? "bg-primary/15 font-semibold text-primary" : "bg-muted text-muted-foreground"}`}
                >
                  {day.l}
                </span>
              ))}
            </div>

            <div className="mt-3 flex gap-2 border-t border-border pt-3">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setForm({
                    id: schedule.id,
                    device_id: schedule.device_id ?? "",
                    action: schedule.action ?? "ON",
                    time_on: String(schedule.time_on).slice(0, 5),
                    time_off: String(schedule.time_off).slice(0, 5),
                    days: normalizeDays(schedule.days),
                    enabled: schedule.enabled,
                  });
                  setOpen(true);
                }}
              >
                Edit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto text-destructive"
                onClick={async () => {
                  if (window.confirm("Hapus jadwal?")) {
                    try {
                      // try to notify device first
                      const device = devices.find(
                        (d) => d.id === schedule.device_id,
                      );
                      const topic =
                        device?.topic ??
                        `device/${schedule.device_id}/schedule/set`;
                      const ackTopic = device?.topic
                        ? `${device.topic}/schedule/ack`
                        : `device/${schedule.device_id}/schedule/ack`;
                      const deviceField =
                        device?.device_id ?? device?.id ?? schedule.device_id;
                      const payload = JSON.stringify({
                        op: "delete",
                        id: schedule.id,
                        device: deviceField,
                      });

                      const ackPromise = new Promise<boolean>(
                        (resolve, reject) => {
                          const handler = (_t: string, message: string) => {
                            try {
                              const m = JSON.parse(message);
                              if (
                                m?.id === schedule.id &&
                                m?.op === "delete" &&
                                (m.status === "ok" || m.status === "deleted")
                              ) {
                                mqtt.unsubscribe(ackTopic, handler);
                                clearTimeout(timeoutId);
                                resolve(true);
                              }
                            } catch {}
                          };

                          mqtt.subscribe(ackTopic, handler);
                          const timeoutId = setTimeout(() => {
                            try {
                              mqtt.unsubscribe(ackTopic, handler);
                            } catch {}
                            reject(new Error("no-ack"));
                          }, 5000);
                        },
                      );

                      mqtt.publish(topic, payload as unknown as string);
                      await ackPromise.catch(() => {
                        // ignore
                      });
                    } catch (e) {
                      // ignore publish errors
                    }

                    await deleteScheduleAction({ id: schedule.id });
                    window.location.reload();
                  }
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
        {schedules.length === 0 ? (
          <p className="py-12 text-center text-muted-foreground">
            Belum ada jadwal.
          </p>
        ) : null}
      </div>
    </MobileLayout>
  );
}

function normalizeDays(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((day): day is string => typeof day === "string");
  }

  return [];
}
