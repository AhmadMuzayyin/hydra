import { JadwalClient } from "@/components/pages/jadwal-client";
import { getCurrentUser } from "@/lib/auth";
import { listDevices, listSchedules, getSettings } from "@/lib/data";
import { toMqttConfig } from "@/lib/mqtt";

export const dynamic = "force-dynamic";

export default async function JadwalPage() {
  const user = await getCurrentUser();
  const [devices, schedules, settings] = await Promise.all([
    listDevices(),
    listSchedules(),
    getSettings(),
  ]);

  return (
    <JadwalClient
      devices={devices}
      schedules={schedules}
      mqttConfig={toMqttConfig(settings.mqtt_config ?? settings.mqtt)}
      userRole={user?.role}
    />
  );
}
