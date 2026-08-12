import type { MqttConfig } from "@/hooks/use-mqtt";

export const DEFAULT_MQTT_CONFIG: MqttConfig = {
    host: "c6a0495a63b84e1eaa7c67371b975437.s1.eu.hivemq.cloud",
    port: 8883,
    path: "/mqtt",
    username: "ustad.dev",
    password: "Mocachino18@",
};

export function toMqttConfig(value: unknown): MqttConfig {
    const source = isRecord(value) ? value : {};

    return {
        host: asString(source.host) ?? DEFAULT_MQTT_CONFIG.host,
        port: asNumber(source.port) ?? DEFAULT_MQTT_CONFIG.port,
        path: asString(source.path) ?? DEFAULT_MQTT_CONFIG.path,
        username: asString(source.username) ?? DEFAULT_MQTT_CONFIG.username,
        password: asString(source.password) ?? DEFAULT_MQTT_CONFIG.password,
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function asString(value: unknown): string | undefined {
    return typeof value === "string" && value.trim() ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }

    if (typeof value === "string" && value.trim()) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : undefined;
    }

    return undefined;
}
