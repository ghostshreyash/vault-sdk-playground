const MAX_DEPTH = 14;
const MAX_TEXT = 300_000;

const hexHead = (bytes: Uint8Array) =>
  Array.from(bytes.subarray(0, 24), (b) => b.toString(16).padStart(2, "0")).join(" ");

/** Turns anything the SDK returns or throws into plain JSON without losing what matters. */
export function toSerializable(value: unknown, ancestors: object[] = []): unknown {
  if (value === undefined) return "[undefined]";
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : `[${String(value)}]`;
  if (typeof value === "bigint") return `${value}n`;
  if (typeof value === "symbol") return value.toString();
  if (typeof value === "function") return `[Function ${value.name || "anonymous"}]`;
  if (ancestors.length > MAX_DEPTH) return "[Max depth]";

  const obj = value as object;
  if (ancestors.includes(obj)) return "[Circular]";

  if (typeof File !== "undefined" && obj instanceof File) {
    return { __type: "File", name: obj.name, size: obj.size, type: obj.type };
  }
  if (typeof Blob !== "undefined" && obj instanceof Blob) {
    return { __type: "Blob", size: obj.size, type: obj.type };
  }
  if (obj instanceof ArrayBuffer || ArrayBuffer.isView(obj)) {
    const bytes =
      obj instanceof ArrayBuffer
        ? new Uint8Array(obj)
        : new Uint8Array(obj.buffer, obj.byteOffset, obj.byteLength);
    return { __type: obj.constructor.name, byteLength: bytes.byteLength, head: hexHead(bytes) };
  }
  if (obj instanceof Date) return obj.toISOString();
  if (typeof WebSocket !== "undefined" && obj instanceof WebSocket) {
    return { __type: "WebSocket", url: obj.url, readyState: obj.readyState, protocol: obj.protocol };
  }

  const next = [...ancestors, obj];
  if (obj instanceof Error) {
    const out: Record<string, unknown> = { name: obj.name, message: obj.message };
    for (const [key, val] of Object.entries(obj)) {
      if (key !== "stack") out[key] = toSerializable(val, next);
    }
    out.stack = obj.stack;
    return out;
  }
  if (Array.isArray(obj)) return obj.map((item) => toSerializable(item, next));
  if (obj instanceof Map) {
    return { __type: "Map", entries: [...obj.entries()].map((entry) => toSerializable(entry, next)) };
  }
  if (obj instanceof Set) return { __type: "Set", values: [...obj].map((item) => toSerializable(item, next)) };

  const withJson = obj as { toJSON?: () => unknown };
  if (typeof withJson.toJSON === "function" && obj.constructor?.name === "AxiosHeaders") {
    return toSerializable(withJson.toJSON(), next);
  }

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) out[key] = toSerializable(val, next);
  return out;
}

export function stringify(value: unknown): string {
  const text = JSON.stringify(toSerializable(value), null, 2) ?? "undefined";
  return text.length > MAX_TEXT
    ? `${text.slice(0, MAX_TEXT)}\n… truncated (${text.length.toLocaleString()} characters total)`
    : text;
}

export function preview(value: unknown, max = 140): string {
  const text = JSON.stringify(toSerializable(value)) ?? "undefined";
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function getPath(value: unknown, path: string): unknown {
  const keys = path.replace(/\[(\w+)\]/g, ".$1").split(".").filter(Boolean);
  let current = value;
  for (const key of keys) {
    if (current === null || current === undefined) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}
