import axios from "axios";
import type { LoadedSdk } from "./loader";
import { recordEvent, recordHttpEnd, recordHttpStart } from "./traffic";
import type { EnvConfig } from "@/store/workspace";

interface Interceptable {
  interceptors: {
    request: { use: (onFulfilled: (config: never) => unknown) => number };
    response: {
      use: (onFulfilled: (response: never) => unknown, onRejected: (error: never) => unknown) => number;
    };
  };
}

type TrafficHandle = ReturnType<typeof recordHttpStart>;
type TaggedConfig = Parameters<typeof recordHttpStart>[0] & { __traffic?: TrafficHandle };

export interface VaultInstance {
  [key: string]: unknown;
  httpClient?: Interceptable;
  ws?: WebSocket | null;
  botChatWs?: WebSocket | null;
  emit?: (name: string, ...args: unknown[]) => boolean;
  removeAllListeners?: (event?: string) => void;
}

const hooked = new WeakSet<object>();

function instrumentAxios(target: Interceptable | undefined) {
  if (!target || hooked.has(target)) return;
  hooked.add(target);
  target.interceptors.request.use((config: TaggedConfig) => {
    config.__traffic = recordHttpStart(config);
    return config;
  });
  target.interceptors.response.use(
    (response: { config: TaggedConfig; status: number; headers: unknown; data: unknown }) => {
      recordHttpEnd(response.config.__traffic, response);
      return response;
    },
    (error: {
      config?: TaggedConfig;
      message: string;
      response?: { status: number; headers: unknown; data: unknown };
    }) => {
      recordHttpEnd(error.config?.__traffic, { ...error.response, error: error.message });
      return Promise.reject(error);
    }
  );
}

// Uploads PUT to storage through the default axios export, not the SDK's client.
instrumentAxios(axios as unknown as Interceptable);

let current: { key: string; instance: VaultInstance; createdAt: number } | null = null;

export function getVault(sdk: LoadedSdk, config: EnvConfig): VaultInstance {
  const key = JSON.stringify([sdk.sourceId, sdk.version, config]);
  if (current?.key === key) return current.instance;

  disposeVault();
  const instance = new sdk.Vault({ ...config }) as VaultInstance;
  instrumentAxios(instance.httpClient);

  if (typeof instance.emit === "function") {
    const emit = instance.emit.bind(instance);
    instance.emit = (name: string, ...args: unknown[]) => {
      recordEvent(name, args);
      return emit(name, ...args);
    };
  }

  current = { key, instance, createdAt: Date.now() };
  return instance;
}

export function disposeVault() {
  if (!current) return;
  const { instance } = current;
  current = null;
  try {
    instance.ws?.close();
    instance.botChatWs?.close();
    instance.removeAllListeners?.();
  } catch {
    // A half-open socket can throw on close; the instance is discarded anyway.
  }
}

export const peekVault = () => current;
