"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import mqtt, { MqttClient } from "mqtt";

export type MqttConfig = {
  host?: string;
  port?: number;
  path?: string;
  username?: string;
  password?: string;
};

export function useMqtt(cfg?: MqttConfig) {
  const ref = useRef<MqttClient | null>(null);
  const handlersRef = useRef(new Map<string, Set<(topic: string, message: string) => void>>());
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!cfg?.host) return;

    const isTlsPort = cfg.port === 8883;
    const wsPort = cfg.port && !isTlsPort ? cfg.port : 8084;
    const url = `wss://${cfg.host}:${wsPort}${cfg.path ?? "/mqtt"}`;

    const client = mqtt.connect(url, {
      username: cfg.username || undefined,
      password: cfg.password || undefined,
      reconnectPeriod: 5000,
      connectTimeout: 8000,
    });

    ref.current = client;
    const handlers = handlersRef.current;

    client.on("connect", () => setConnected(true));
    client.on("close", () => setConnected(false));
    client.on("error", () => setConnected(false));
    client.on("message", (topic, payload) => {
      const message = payload.toString();
      const topicHandlers = handlers.get(topic);
      topicHandlers?.forEach((handler) => handler(topic, message));
    });

    return () => {
      client.end(true);
      ref.current = null;
      handlers.clear();
      setConnected(false);
    };
  }, [cfg?.host, cfg?.port, cfg?.path, cfg?.username, cfg?.password]);

  const subscribe = useCallback((topic: string, handler: (topic: string, message: string) => void) => {
    const client = ref.current;
    if (!client) return;

    const existing = handlersRef.current.get(topic) ?? new Set();
    existing.add(handler);
    handlersRef.current.set(topic, existing);
    client.subscribe(topic);
  }, []);

  const unsubscribe = useCallback((topic: string, handler?: (topic: string, message: string) => void) => {
    const client = ref.current;
    if (!client) return;

    if (!handler) {
      handlersRef.current.delete(topic);
      client.unsubscribe(topic);
      return;
    }

    const existing = handlersRef.current.get(topic);
    if (!existing) return;
    existing.delete(handler);
    if (existing.size === 0) {
      handlersRef.current.delete(topic);
      client.unsubscribe(topic);
    }
  }, []);

  const publish = useCallback((topic: string, message: string) => ref.current?.publish(topic, message), []);

  return useMemo(() => ({
    connected,
    publish,
    subscribe,
    unsubscribe,
  }), [connected, publish, subscribe, unsubscribe]);
}
