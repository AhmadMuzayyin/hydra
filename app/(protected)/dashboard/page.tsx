import { DashboardClient } from "@/components/pages/dashboard-client";
import { getCurrentUser } from "@/lib/auth";
import { getSettings, listDevices } from "@/lib/data";
import { toMqttConfig } from "@/lib/mqtt";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const [devices, settings] = await Promise.all([listDevices(), getSettings()]);

  return (
    <DashboardClient
      devices={devices}
      mqttConfig={toMqttConfig(settings.mqtt_config ?? settings.mqtt)}
      userRole={user?.role}
    />
  );
}
