import { KontrolClient } from "@/components/pages/kontrol-client";
import { getCurrentUser } from "@/lib/auth";
import { getSettings, listDevices } from "@/lib/data";
import { toMqttConfig } from "@/lib/mqtt";

export const dynamic = "force-dynamic";

export default async function KontrolPage() {
  const user = await getCurrentUser();
  const [devices, settings] = await Promise.all([listDevices(), getSettings()]);
  const controlDevices = devices
    .filter(
      (device) =>
        device.device_type === "pump" || device.device_type === "valve",
    )
    .map((device) => {
      const row = device as Record<string, unknown>;
      const deviceId =
        asString(row.device_type) || asString(row.device_id) || "unknown";
      const topicCmd =
        asString(row.topic_cmd) ||
        toCmdTopic(asString(row.topic)) ||
        (deviceId !== "unknown" ? `tandon/${deviceId}/cmd` : "");
      const topicStatus =
        asString(row.topic_status) ||
        toStatusTopic(asString(row.topic), topicCmd) ||
        (deviceId !== "unknown" ? `tandon/${deviceId}/status` : "");

      return {
        id: device.id,
        name: device.name,
        status: device.status,
        device_id: deviceId,
        topic_cmd: topicCmd,
        topic_status: topicStatus,
      };
    })
    .sort((a, b) => String(a.device_id).localeCompare(String(b.device_id)));

  return (
    <KontrolClient
      devices={controlDevices}
      mqttConfig={toMqttConfig(settings.mqtt_config ?? settings.mqtt)}
      userRole={user?.role}
    />
  );
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function toCmdTopic(topic?: string): string | undefined {
  if (!topic) return undefined;
  if (topic.endsWith("/cmd")) return topic;
  if (topic.endsWith("/status")) return topic.replace(/\/status$/, "/cmd");
  return topic;
}

function toStatusTopic(
  topic: string | undefined,
  topicCmd: string | undefined,
): string | undefined {
  if (topic?.endsWith("/status")) return topic;
  if (topicCmd?.endsWith("/cmd")) return topicCmd.replace(/\/cmd$/, "/status");
  if (topic) return `${topic}/status`;
  return undefined;
}
