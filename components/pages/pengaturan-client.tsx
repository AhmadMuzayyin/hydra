"use client";

import { useMemo, useState } from "react";
import { Cpu, Radio, Wifi } from "lucide-react";
import { MobileLayout } from "@/components/mobile-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveSettingAction } from "@/app/actions";

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

  const [mqtt, setMqtt] = useState<MqttDraft>(initialMqtt);
  const [wifi, setWifi] = useState<WifiDraft>(initialWifi);
  const [info, setInfo] = useState<InfoDraft>(initialInfo);

  const isAdmin = userRole === "admin" || !userRole;

  const doSave = async (key: string, value: unknown) => {
    await saveSettingAction({ key, value });
    window.alert("Tersimpan");
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

      <Section icon={<Radio className="h-5 w-5" />} title="MQTT Broker">
        <Field
          label="Host"
          value={mqtt.host}
          onChange={(value) => setMqtt({ ...mqtt, host: value })}
          disabled={!isAdmin}
        />
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Port"
            value={String(mqtt.port)}
            onChange={(value) => setMqtt({ ...mqtt, port: Number(value) || 0 })}
            disabled={!isAdmin}
          />
          <Field
            label="Path"
            value={mqtt.path}
            onChange={(value) => setMqtt({ ...mqtt, path: value })}
            disabled={!isAdmin}
          />
        </div>
        <Field
          label="Username"
          value={mqtt.username}
          onChange={(value) => setMqtt({ ...mqtt, username: value })}
          disabled={!isAdmin}
        />
        <Field
          label="Password"
          value={mqtt.password}
          onChange={(value) => setMqtt({ ...mqtt, password: value })}
          disabled={!isAdmin}
          type="password"
        />
        {isAdmin ? (
          <Button
            onClick={() => doSave("mqtt_config", mqtt)}
            className="mt-2 w-full"
          >
            Simpan MQTT
          </Button>
        ) : null}
      </Section>

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
