import type { MqttConfig } from "@/hooks/use-mqtt";

export function toMqttConfig(value: unknown): MqttConfig {
    const source = isRecord(value) ? value : {};

    return {
        host: asString(source.host),
        port: asNumber(source.port),
        path: asString(source.path),
        username: asString(source.username),
        password: asString(source.password),
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
