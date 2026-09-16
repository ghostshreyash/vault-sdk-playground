import { create } from "zustand";
import { toSerializable } from "./serialize";

export interface HttpEntry {
  id: string;
  ts: number;
  kind: "http";
  method: string;
  url: string;
  requestHeaders: unknown;
  requestBody: unknown;
  pending: boolean;
  status?: number;
  responseHeaders?: unknown;
  responseBody?: unknown;
  error?: string;
  durationMs?: number;
}

export type WsPhase = "connect" | "open" | "out" | "in" | "close" | "error";

export interface WsEntry {
  id: string;
  ts: number;
  kind: "ws";
  phase: WsPhase;
  url: string;
  data?: unknown;
}

export interface EventEntry {
  id: string;
  ts: number;
  kind: "event";
  name: string;
  args: unknown;
}

export type TrafficEntry = HttpEntry | WsEntry | EventEntry;

const MAX_ENTRIES = 1500;
let seq = 0;
const nextId = () => `t${Date.now().toString(36)}${(seq++).toString(36)}`;

export const useTraffic = create<{ entries: TrafficEntry[] }>()(() => ({ entries: [] }));

export const clearTraffic = () => useTraffic.setState({ entries: [] });

const push = (entry: TrafficEntry) =>
  useTraffic.setState((state) => ({ entries: [...state.entries, entry].slice(-MAX_ENTRIES) }));

const parseMaybeJson = (data: unknown) => {
  if (typeof data !== "string") return toSerializable(data);
  try {
    return JSON.parse(data);
  } catch {
    return data;
  }
};

interface AxiosLikeConfig {
  method?: string;
  url?: string;
  baseURL?: string;
  headers?: unknown;
  data?: unknown;
}

export function recordHttpStart(config: AxiosLikeConfig): { id: string; started: number } {
  const id = nextId();
  const url = config.url ?? "";
  const absolute = /^[a-z][a-z\d+.-]*:\/\//i.test(url)
    ? url
    : `${(config.baseURL ?? "").replace(/\/+$/, "")}${url.startsWith("/") ? "" : "/"}${url}`;
  push({
    id,
    ts: Date.now(),
    kind: "http",
    method: (config.method ?? "get").toUpperCase(),
    url: absolute,
    requestHeaders: toSerializable(config.headers),
    requestBody: config.data === undefined ? undefined : toSerializable(config.data),
    pending: true,
  });
  return { id, started: performance.now() };
}

export function recordHttpEnd(
  handle: { id: string; started: number } | undefined,
  outcome: { status?: number; headers?: unknown; data?: unknown; error?: string }
) {
  if (!handle) return;
  const changes: Partial<HttpEntry> = {
    pending: false,
    status: outcome.status,
    responseHeaders: toSerializable(outcome.headers),
    responseBody: toSerializable(outcome.data),
    error: outcome.error,
    durationMs: performance.now() - handle.started,
  };
  useTraffic.setState((state) => ({
    entries: state.entries.map((entry) =>
      entry.id === handle.id ? ({ ...entry, ...changes } as HttpEntry) : entry
    ),
  }));
}

export const recordWs = (phase: WsPhase, url: string, data?: unknown) =>
  push({ id: nextId(), ts: Date.now(), kind: "ws", phase, url, data: parseMaybeJson(data) });

export const recordEvent = (name: string, args: unknown[]) =>
  push({ id: nextId(), ts: Date.now(), kind: "event", name, args: toSerializable(args) });
