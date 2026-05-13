"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Droplets, Activity, Power, Gauge, Waves } from "lucide-react";
import { MobileLayout } from "@/components/mobile-layout";
import { Switch } from "@/components/ui/switch";
import { setDeviceStatusAction } from "@/app/actions";
import { useMqtt, type MqttConfig } from "@/hooks/use-mqtt";
import { useRouter } from "next/navigation";

type DeviceRow = {
  id: string;
  name: string;
  status: boolean;
  topic?: string | null;
  topic_status?: string | null;
  topic_cmd?: string | null;
  device_id?: string | null;
};

type TelemetryPoint = {
  created_at: string;
  level_primary_cm: number;
  level_primary_pct: number;
  level_secondary_cm: number;
  level_secondary_pct: number;
  level_min_triggered: boolean;
  pump_on: boolean;
  valve_on: boolean;
  device_uuid: string;
};

export function DashboardClient({
  userRole,
  devices,
  mqttConfig,
}: {
  userRole?: string;
  devices: DeviceRow[];
  mqttConfig?: MqttConfig;
}) {
  const mqtt = useMqtt(mqttConfig);
  const [telemetry, setTelemetry] = useState<TelemetryPoint[]>([]);
  const { connected, subscribe, unsubscribe } = mqtt;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [localDevices, setLocalDevices] = useState<DeviceRow[]>(devices ?? []);

  useEffect(() => {
    if (!connected) return;

    const topic = "tandon/device/telemetry";
    const handler = (_topic: string, message: string) => {
      try {
        const raw = JSON.parse(message);
        const point: TelemetryPoint = {
          created_at: new Date().toISOString(),
          level_primary_cm: Number(
            raw?.level?.primary?.height_cm ??
              raw?.level?.primary_cm ??
              raw?.level_cm ??
              0,
          ),
          level_primary_pct: Number(
            raw?.level?.primary?.height_pct ??
              raw?.level?.primary_pct ??
              raw?.level_pct ??
              0,
          ),
          level_secondary_cm: Number(raw?.level?.secondary?.height_cm ?? 0),
          level_secondary_pct: Number(raw?.level?.secondary?.height_pct ?? 0),
          level_min_triggered: Boolean(
            raw?.level?.min_triggered ?? raw?.triggered ?? false,
          ),
          pump_on: Boolean(raw?.pump?.state ?? raw?.pump_on ?? false),
          valve_on: Boolean(raw?.valve?.state ?? raw?.valve_on ?? false),
          device_uuid: String(raw?.device_uuid ?? ""),
        };
        setTelemetry((prev) => [...prev, point].slice(-50));
      } catch {
        // ignore invalid payload
      }
    };

    subscribe(topic, handler);
    return () => unsubscribe(topic, handler);
  }, [connected, subscribe, unsubscribe]);

  const latest = telemetry[telemetry.length - 1];
  const levelCm = latest?.level_primary_cm ?? 0;
  const levelPct = latest?.level_primary_pct ?? 0;
  const levelSecondaryCm = latest?.level_secondary_cm ?? 0;
  const levelSecondaryPct = latest?.level_secondary_pct ?? 0;

  const labels = telemetry.map((row) =>
    new Date(row.created_at).toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
    }),
  );
  const values = telemetry.map((row) => Number(row.level_primary_cm ?? 0));
  useEffect(() => {
    setLocalDevices(devices ?? []);
  }, [devices]);

  useEffect(() => {
    if (!latest) return;
    setLocalDevices((rows) =>
      rows.map((row) => {
        if (row.device_id === "pump") {
          return { ...row, status: Boolean(latest.pump_on) };
        }
        if (row.device_id === "valve") {
          return { ...row, status: Boolean(latest.valve_on) };
        }
        return row;
      }),
    );
  }, [latest?.pump_on, latest?.valve_on]);

  const deviceItems = useMemo(() => localDevices ?? [], [localDevices]);

  const toggle = async (device: DeviceRow, value: boolean) => {
    const prev = device.status;

    setLocalDevices((rows) =>
      rows.map((row) =>
        row.id === device.id ? { ...row, status: value } : row,
      ),
    );

    try {
      await setDeviceStatusAction({ id: device.id, status: value });

      const topic = device.topic_cmd ?? device.topic ?? "";
      if (topic) {
        mqtt.publish(
          topic,
          JSON.stringify({
            cmd: "SET",
            device: device.device_id,
            action: value ? "ON" : "OFF",
            mode: "manual",
            request_id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
          }),
        );
      }

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
    <MobileLayout title="Dashboard" role={userRole}>
      <div className="mb-5 grid grid-cols-2 gap-3">
        <StatCard
          icon={<Droplets className="h-5 w-5" />}
          label="Level Tangki (cm)"
          value={`${Number(levelCm).toFixed(0)} cm`}
        />
        <StatCard
          icon={<Gauge className="h-5 w-5" />}
          label="Level Tangki %"
          value={`${Number(levelPct).toFixed(0)}%`}
        />
        <StatCard
          icon={<Waves className="h-5 w-5" />}
          label="Level Bak (cm)"
          value={`${Number(levelSecondaryCm).toFixed(0)} cm`}
        />
        <StatCard
          icon={<Activity className="h-5 w-5" />}
          label="Level Bak %"
          value={`${Number(levelSecondaryPct).toFixed(0)}%`}
        />
      </div>

      <div className="mb-4">
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

      {/* Chart removed per request */}

      <section className="mt-5">
        <h2 className="mb-2 font-semibold">Perangkat</h2>
        <div className="space-y-3">
          {deviceItems.map((device) => (
            <div
              key={device.id}
              className="rounded-2xl border border-border bg-card p-3 flex items-center justify-between"
            >
              <div className="min-w-0 flex items-center gap-3">
                {(() => {
                  const Icon = device.device_id === "pump" ? Droplets : Waves;
                  return <Icon className="h-5 w-5 text-muted-foreground" />;
                })()}
                <div className="min-w-0">
                  <p className="truncate font-semibold">{device.name}</p>
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {device.topic_status ?? device.topic ?? ""}
                  </p>
                </div>
              </div>
              <div>
                <Switch
                  checked={Boolean(device.status)}
                  onCheckedChange={(v) => toggle(device, Boolean(v))}
                  disabled={isPending}
                />
              </div>
            </div>
          ))}

          {/*
            Tombol tambah perangkat (komentar):
            <Button className="mt-3 w-full">Tambah Perangkat</Button>
          */}
        </div>
      </section>
    </MobileLayout>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}
