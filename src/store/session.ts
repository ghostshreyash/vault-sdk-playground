import { create } from "zustand";

export type RunPhase = "constructor" | "arguments" | "call";

export interface RunRecord {
  id: string;
  method: string;
  envName: string;
  sdkLabel: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  outcome: "resolved" | "threw";
  phase: RunPhase;
  value?: unknown;
  error?: unknown;
  args: unknown[];
}

interface SessionState {
  running: Record<string, number>;
  results: Record<string, RunRecord>;
  last: unknown;
}

export const useSession = create<SessionState>()(() => ({ running: {}, results: {}, last: undefined }));

export const markRunning = (method: string, delta: 1 | -1) =>
  useSession.setState((s) => ({
    running: { ...s.running, [method]: Math.max(0, (s.running[method] ?? 0) + delta) },
  }));

export const storeResult = (record: RunRecord) =>
  useSession.setState((s) => ({
    results: { ...s.results, [record.method]: record },
    last: record.outcome === "resolved" ? record.value : s.last,
  }));
