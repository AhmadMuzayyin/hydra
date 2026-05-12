"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Droplets, Waves } from "lucide-react";
import { MobileLayout } from "@/components/mobile-layout";
import { Switch } from "@/components/ui/switch";
import { setDeviceStatusAction } from "@/app/actions";
import { useMqtt, type MqttConfig } from "@/hooks/use-mqtt";
import { useRouter } from "next/navigation";

type DeviceRow = {
  id: string;
  name: string;
  status: boolean;
  device_id: string;
  topic_cmd: string;
  topic_status: string;
};

export function KontrolClient({
  userRole,
  devices,
  mqttConfig,
}: {
  userRole?: string;
  devices: DeviceRow[];
  mqttConfig?: MqttConfig;
}) {
  const mqtt = useMqtt(mqttConfig);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [localDevices, setLocalDevices] = useState<DeviceRow[]>(devices ?? []);

  useEffect(() => {
    setLocalDevices(devices ?? []);
  }, [devices]);

  const controlDevices = useMemo(() => {
    return (localDevices ?? [])
      .filter(
        (device) => device.device_id === "pump" || device.device_id === "valve",
      )
      .sort((a, b) => String(a.device_id).localeCompare(String(b.device_id)));
  }, [localDevices]);

  const toggle = async (device: DeviceRow, value: boolean) => {
    const prev = device.status;

    setLocalDevices((rows) =>
      rows.map((row) =>
        row.id === device.id ? { ...row, status: value } : row,
      ),
    );

    try {
      await setDeviceStatusAction({ id: device.id, status: value });
      mqtt.publish(
        device.topic_cmd,
        JSON.stringify({
          cmd: "SET",
          device: device.device_id,
          action: value ? "ON" : "OFF",
          mode: "manual",
          request_id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
        }),
      );

      startTransition(() => {
        router.refresh();
      });
    } catch {
      setLocalDevices((rows) =>
        rows.map((row) =>
          row.id === device.id ? { ...row, status: prev } : row,
        ),
      );
      window.alert("Gagal mengubah status perangkat");
    }
  };

  return (
    <MobileLayout title="Kontrol" role={userRole}>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          MQTT:{" "}
          <span
            className={
              mqtt.connected
                ? "font-semibold text-accent"
                : "font-semibold text-destructive"
            }
          >
            {mqtt.connected ? "Terhubung" : "Tidak terhubung"}
          </span>
        </p>
      </div>

      <div className="space-y-3">
        {controlDevices.map((device) => (
          <div
            key={device.id}
            className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div
                  className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${device.status ? "bg-[var(--gradient-primary)] text-emerald-950 ring-1 ring-black/15" : "bg-muted text-muted-foreground"}`}
                >
                  {device.device_id === "pump" ? (
                    <Droplets className="h-6 w-6" />
                  ) : (
                    <Waves className="h-6 w-6" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-semibold">{device.name}</p>
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {device.topic_cmd}
                  </p>
                  <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">
                    Topic status: {device.topic_status}
                  </p>
                </div>
              </div>
              <Switch
                checked={device.status}
                onCheckedChange={(value) => toggle(device, value)}
                disabled={isPending}
                className="scale-125"
              />
            </div>
          </div>
        ))}
        {controlDevices.length === 0 ? (
          <p className="py-12 text-center text-muted-foreground">
            Belum ada perangkat.
          </p>
        ) : null}
      </div>
    </MobileLayout>
  );
}
