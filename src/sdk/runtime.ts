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

const TEXT_BODY = /json|text|xml|urlencoded/i;

const readBody = async (response: Response) => {
  const type = response.headers.get("content-type") ?? "";
  if (!TEXT_BODY.test(type)) return `<${type || "binary"}, ${response.headers.get("content-length") ?? "?"} bytes>`;
  const text = await response.clone().text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

// Vault Connect uses fetch, not axios, so its calls (uploads included) go through this.
const recordingFetch: typeof fetch = async (input, init) => {
  // Read url, method and headers without new Request(), which would lock a streamed upload body.
  const url = input instanceof Request ? input.url : String(input);
  const handle = recordHttpStart({
    method: init?.method ?? (input instanceof Request ? input.method : "GET"),
    url,
    headers: Object.fromEntries(new Headers(init?.headers)),
    data: typeof init?.body === "string" ? init.body : init?.body ? "<binary body>" : undefined,
  });
  try {
    const response = await fetch(input, init);
    recordHttpEnd(handle, {
      status: response.status,
      headers: Object.fromEntries(response.headers),
      data: await readBody(response),
    });
    return response;
  } catch (error) {
    recordHttpEnd(handle, { error: (error as Error).message });
    throw error;
  }
};

export const connectOptions = (config: EnvConfig) => ({
  clientId: config.VC_CLIENT_ID ?? "",
  redirectUri: config.VC_REDIRECT_URI ?? "",
  ...(config.VC_API_URL && { apiUrl: config.VC_API_URL }),
  ...(config.VC_APP_URL && { appUrl: config.VC_APP_URL }),
  rememberUser: true,
  fetch: recordingFetch,
});

let current: { key: string; instance: VaultInstance; createdAt: number } | null = null;

export function getVault(sdk: LoadedSdk, config: EnvConfig): VaultInstance {
  const key = JSON.stringify([sdk.sourceId, sdk.version, config]);
  if (current?.key === key) return current.instance;

  disposeVault();
  const instance = new sdk.Vault(sdk.family === "connect" ? connectOptions(config) : { ...config }) as VaultInstance;
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
