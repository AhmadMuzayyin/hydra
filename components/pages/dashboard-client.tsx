"use client";

import { useEffect, useMemo, useState } from "react";
import { Droplets, Activity, Power, Gauge } from "lucide-react";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Filler,
} from "chart.js";
import { MobileLayout } from "@/components/mobile-layout";
import { useMqtt, type MqttConfig } from "@/hooks/use-mqtt";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Filler,
);

type DeviceRow = {
  id: string;
  name: string;
  status: boolean;
  topic?: string | null;
  topic_status?: string | null;
  device_id?: string | null;
};

type TelemetryPoint = {
  created_at: string;
  level_primary_cm: number;
  level_primary_pct: number;
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

  useEffect(() => {
    if (!connected) return;

    const topic = "tandon/device/telemetry";
    const handler = (_topic: string, message: string) => {
      try {
        const raw = JSON.parse(message);
        const point: TelemetryPoint = {
          created_at: new Date().toISOString(),
          level_primary_cm: Number(
            raw?.level?.primary_cm ?? raw?.level_cm ?? 0,
          ),
          level_primary_pct: Number(
            raw?.level?.primary_pct ?? raw?.level_pct ?? 0,
          ),
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
  const activeCount = [latest?.pump_on, latest?.valve_on].filter(
    Boolean,
  ).length;
  const totalCount = 2;

  const labels = telemetry.map((row) =>
    new Date(row.created_at).toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
    }),
  );
  const values = telemetry.map((row) => Number(row.level_primary_cm ?? 0));
  const deviceItems = useMemo(() => devices ?? [], [devices]);

  return (
    <MobileLayout title="Dashboard" role={userRole}>
      <div className="mb-5 grid grid-cols-2 gap-3">
        <StatCard
          icon={<Droplets className="h-5 w-5" />}
          label="Level Air"
          value={`${Number(levelCm).toFixed(0)} cm`}
        />
        <StatCard
          icon={<Power className="h-5 w-5" />}
          label="Pompa Aktif"
          value={`${activeCount}/${totalCount}`}
        />
        <StatCard
          icon={<Gauge className="h-5 w-5" />}
          label="Level %"
          value={`${Number(levelPct).toFixed(0)}%`}
        />
        <StatCard
          icon={<Activity className="h-5 w-5" />}
          label="Alarm Min"
          value={latest?.level_min_triggered ? "TRIGGER" : "OK"}
        />
      </div>

      <section className="mb-5 rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Identitas Perangkat</h2>
          </div>
          <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
            {latest?.device_uuid ? "Tersambung" : "Belum ada data"}
          </span>
        </div>
        <div className="mt-3 break-all rounded-xl border border-dashed border-border px-3 py-2 font-mono text-sm text-foreground/80">
          {latest?.device_uuid || "Telemetry belum diterima dari perangkat"}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Riwayat Level</h2>
          <span className="text-xs text-muted-foreground">
            50 data terakhir
          </span>
        </div>
        <div className="h-48">
          {values.length > 0 ? (
            <Line
              data={{
                labels,
                datasets: [
                  {
                    data: values,
                    borderColor: "oklch(0.62 0.14 175)",
                    backgroundColor:
                      "color-mix(in oklab, oklch(0.62 0.14 175) 20%, transparent)",
                    borderWidth: 2,
                    fill: true,
                    tension: 0.35,
                    pointRadius: 0,
                  },
                ],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: { tooltip: { enabled: true } },
                scales: {
                  y: { beginAtZero: true, max: 200, ticks: { stepSize: 50 } },
                  x: { ticks: { maxTicksLimit: 6 } },
                },
              }}
            />
          ) : (
            <div className="grid h-full place-items-center text-sm text-muted-foreground">
              Menunggu telemetry live dari MQTT
            </div>
          )}
        </div>
      </section>

      <section className="mt-5">
        <h2 className="mb-2 font-semibold">Status Perangkat</h2>
        <div className="space-y-2">
          {deviceItems.map((device) => (
            <div
              key={device.id}
              className="flex items-center justify-between rounded-xl border border-border bg-card p-3"
            >
              <div>
                <p className="font-medium">{device.name}</p>
                <p className="font-mono text-xs text-muted-foreground">
                  {device.topic_status ?? device.topic ?? ""}
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${device.status ? "bg-accent/15 text-accent" : "bg-muted text-muted-foreground"}`}
              >
                {device.status ? "ON" : "OFF"}
              </span>
            </div>
          ))}
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
