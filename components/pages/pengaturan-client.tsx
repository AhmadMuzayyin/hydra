"use client";

import { useMemo, useState } from "react";
import { Cpu, Radio, Wifi } from "lucide-react";
import { MobileLayout } from "@/components/mobile-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { saveSettingAction } from "@/app/actions";
import { useMqtt, type MqttConfig } from "@/hooks/use-mqtt";

type SettingsShape = Record<string, unknown>;

type MqttDraft = {
  host: string;
  port: number;
  path: string;
  username: string;
  password: string;
};

type WifiDraft = {
  ssid: string;
  password: string;
};

type InfoDraft = {
  name: string;
  location: string;
};

type TankDraft = {
  level_min_cm: number;
  level_full_cm: number;
  buzzer_enabled: boolean;
  tank_height_cm: number;
  pump_on_threshold: number;
  pump_off_threshold: number;
  valve_open_threshold: number;
};

type SecondaryTankDraft = {
  tank_height_cm: number;
  level_full_cm: number;
};

type TelemetryDraft = {
  retention_days: number;
  poll_interval_sec: number;
  telemetry_interval_sec: number;
};

export function PengaturanClient({
  userRole,
  settings,
}: {
  userRole?: string;
  settings: SettingsShape;
}) {
  const initialMqtt = useMemo(() => mergeMqtt(settings), [settings]);
  const initialWifi = useMemo(() => mergeWifi(settings), [settings]);
  const initialInfo = useMemo(() => mergeInfo(settings), [settings]);
  const initialTank = useMemo(() => mergeTank(settings), [settings]);
  const initialSecondaryTank = useMemo(
    () => mergeSecondaryTank(settings),
    [settings],
  );
  const initialTelemetry = useMemo(() => mergeTelemetry(settings), [settings]);

  const [mqtt, setMqtt] = useState<MqttDraft>(initialMqtt);
  const [wifi, setWifi] = useState<WifiDraft>(initialWifi);
  const [info, setInfo] = useState<InfoDraft>(initialInfo);
  const [tank, setTank] = useState<TankDraft>(initialTank);
  const [secondaryTank, setSecondaryTank] =
    useState<SecondaryTankDraft>(initialSecondaryTank);
  const [telemetry, setTelemetry] = useState<TelemetryDraft>(initialTelemetry);

  const mqttClient = useMqtt(initialMqtt as MqttConfig);

  const isAdmin = userRole === "admin" || !userRole;

  const doSave = async (key: string, value: unknown) => {
    await saveSettingAction({ key, value });
    window.alert("Tersimpan");

    try {
      if (key === "tank_config") {
        const payload = JSON.stringify({ op: "config", tank_config: value });
        mqttClient.publish("tandon/pump/config/set", payload);
        mqttClient.publish("tandon/valve/config/set", payload);
      }

      if (key === "secondary_tank_config") {
        const payload = JSON.stringify({
          op: "config",
          secondary_tank_config: value,
        });
        mqttClient.publish("tandon/pump/config/set", payload);
        mqttClient.publish("tandon/valve/config/set", payload);
      }

      if (key === "wifi_config") {
        const payload = JSON.stringify({ op: "config", wifi_config: value });
        mqttClient.publish("tandon/pump/config/set", payload);
        mqttClient.publish("tandon/valve/config/set", payload);
      }
    } catch {
      // ignore publish errors on client-side
    }
  };

  return (
    <MobileLayout title="Pengaturan" role={userRole}>
      {!isAdmin ? (
        <p className="mb-3 text-sm text-muted-foreground">
          Mode baca — hanya admin dapat mengubah.
        </p>
      ) : null}

      <Section icon={<Cpu className="h-5 w-5" />} title="Info Perangkat">
        <Field
          label="Nama Sistem"
          value={info.name}
          onChange={(value) => setInfo({ ...info, name: value })}
          disabled={!isAdmin}
        />
        <Field
          label="Lokasi"
          value={info.location}
          onChange={(value) => setInfo({ ...info, location: value })}
          disabled={!isAdmin}
        />
        {isAdmin ? (
          <Button
            onClick={() => doSave("device_info", info)}
            className="mt-2 w-full"
          >
            Simpan Info
          </Button>
        ) : null}
      </Section>

      {/* MQTT Broker section removed per request */}

      <Section icon={<Wifi className="h-5 w-5" />} title="WiFi">
        <Field
          label="SSID"
          value={wifi.ssid}
          onChange={(value) => setWifi({ ...wifi, ssid: value })}
          disabled={!isAdmin}
        />
        <Field
          label="Password"
          value={wifi.password}
          onChange={(value) => setWifi({ ...wifi, password: value })}
          disabled={!isAdmin}
          type="password"
        />
        {isAdmin ? (
          <Button
            onClick={() => doSave("wifi_config", wifi)}
            className="mt-2 w-full"
          >
            Simpan WiFi
          </Button>
        ) : null}
      </Section>

      <Section icon={<Cpu className="h-5 w-5" />} title="Tangki">
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Level Minimum (cm)"
            value={String(tank.level_min_cm)}
            onChange={(value) =>
              setTank({ ...tank, level_min_cm: Number(value) || 0 })
            }
            disabled={!isAdmin}
            type="number"
          />
          <Field
            label="Level Penuh (cm)"
            value={String(tank.level_full_cm)}
            onChange={(value) =>
              setTank({ ...tank, level_full_cm: Number(value) || 0 })
            }
            disabled={!isAdmin}
            type="number"
          />
          <Field
            label="Tinggi Tangki (cm)"
            value={String(tank.tank_height_cm)}
            onChange={(value) =>
              setTank({ ...tank, tank_height_cm: Number(value) || 0 })
            }
            disabled={!isAdmin}
            type="number"
          />
          <Field
            label="Threshold Pompa ON"
            value={String(tank.pump_on_threshold)}
            onChange={(value) =>
              setTank({ ...tank, pump_on_threshold: Number(value) || 0 })
            }
            disabled={!isAdmin}
            type="number"
          />
          <Field
            label="Threshold Pompa OFF"
            value={String(tank.pump_off_threshold)}
            onChange={(value) =>
              setTank({ ...tank, pump_off_threshold: Number(value) || 0 })
            }
            disabled={!isAdmin}
            type="number"
          />
          <Field
            label="Threshold Valve Buka"
            value={String(tank.valve_open_threshold)}
            onChange={(value) =>
              setTank({ ...tank, valve_open_threshold: Number(value) || 0 })
            }
            disabled={!isAdmin}
            type="number"
          />
        </div>
        <div className="flex items-center justify-between rounded-xl border border-border px-3 py-2">
          <Label>Buzzer Aktif</Label>
          <Switch
            checked={tank.buzzer_enabled}
            onCheckedChange={(value) =>
              setTank({ ...tank, buzzer_enabled: value })
            }
            disabled={!isAdmin}
          />
        </div>
        {isAdmin ? (
          <Button
            onClick={() => doSave("tank_config", tank)}
            className="mt-2 w-full"
          >
            Simpan Tangki
          </Button>
        ) : null}
      </Section>

      <Section icon={<Cpu className="h-5 w-5" />} title="Bak Mandi">
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Tinggi Bak (cm)"
            value={String(secondaryTank.tank_height_cm)}
            onChange={(value) =>
              setSecondaryTank({
                ...secondaryTank,
                tank_height_cm: Number(value) || 0,
              })
            }
            disabled={!isAdmin}
            type="number"
          />
          <Field
            label="Level Penuh (cm)"
            value={String(secondaryTank.level_full_cm)}
            onChange={(value) =>
              setSecondaryTank({
                ...secondaryTank,
                level_full_cm: Number(value) || 0,
              })
            }
            disabled={!isAdmin}
            type="number"
          />
        </div>
        {isAdmin ? (
          <Button
            onClick={() => doSave("secondary_tank_config", secondaryTank)}
            className="mt-2 w-full"
          >
            Simpan Bak Mandi
          </Button>
        ) : null}
      </Section>

      {/* Telemetry section removed per request */}
    </MobileLayout>
  );
}

function mergeMqtt(settings: SettingsShape): MqttDraft {
  const source = coerceRecord(settings.mqtt_config ?? settings.mqtt);
  return {
    host: String(source.host ?? ""),
    port: Number(source.port ?? 8084) || 8084,
    path: String(source.path ?? "/mqtt"),
    username: String(source.username ?? ""),
    password: String(source.password ?? ""),
  };
}

function mergeWifi(settings: SettingsShape): WifiDraft {
  const source = coerceRecord(settings.wifi_config ?? settings.wifi);
  return {
    ssid: String(source.ssid ?? ""),
    password: String(source.password ?? ""),
  };
}

function mergeInfo(settings: SettingsShape): InfoDraft {
  const source = coerceRecord(settings.device_info);
  return {
    name: String(source.name ?? ""),
    location: String(source.location ?? ""),
  };
}

function mergeTank(settings: SettingsShape): TankDraft {
  const source = coerceRecord(settings.tank_config);
  return {
    level_min_cm: Number(source.level_min_cm ?? 30) || 30,
    level_full_cm: Number(source.level_full_cm ?? 180) || 180,
    buzzer_enabled: Boolean(source.buzzer_enabled ?? true),
    tank_height_cm: Number(source.tank_height_cm ?? 200) || 200,
    pump_on_threshold: Number(source.pump_on_threshold ?? 50) || 50,
    pump_off_threshold: Number(source.pump_off_threshold ?? 180) || 180,
    valve_open_threshold: Number(source.valve_open_threshold ?? 190) || 190,
  };
}

function mergeSecondaryTank(settings: SettingsShape): SecondaryTankDraft {
  const source = coerceRecord(settings.secondary_tank_config);
  return {
    tank_height_cm: Number(source.tank_height_cm ?? 100) || 100,
    level_full_cm: Number(source.level_full_cm ?? 90) || 90,
  };
}

function mergeTelemetry(settings: SettingsShape): TelemetryDraft {
  const source = coerceRecord(settings.telemetry_config);
  return {
    retention_days: Number(source.retention_days ?? 30) || 30,
    poll_interval_sec: Number(source.poll_interval_sec ?? 5) || 5,
    telemetry_interval_sec: Number(source.telemetry_interval_sec ?? 10) || 10,
  };
}

function coerceRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-4 rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <div className="mb-3 flex items-center gap-2">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </div>
        <h2 className="font-semibold">{title}</h2>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  disabled,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  type?: string;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input
        className="h-11"
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        type={type}
        value={value}
      />
    </div>
  );
}
