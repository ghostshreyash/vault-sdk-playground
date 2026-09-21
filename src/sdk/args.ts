import type { MethodInfo, ParamDoc } from "./catalog";

export type ArgMode =
  | "string"
  | "number"
  | "boolean"
  | "json"
  | "file"
  | "files"
  | "js"
  | "null"
  | "undefined";

export const ARG_MODES: { value: ArgMode; label: string }[] = [
  { value: "string", label: "String" },
  { value: "number", label: "Number" },
  { value: "boolean", label: "Boolean" },
  { value: "json", label: "JSON" },
  { value: "file", label: "File" },
  { value: "files", label: "File[]" },
  { value: "js", label: "JS expression" },
  { value: "null", label: "null" },
  { value: "undefined", label: "undefined" },
];

export interface ArgDraft {
  name: string;
  mode: ArgMode;
  value: string;
  files?: File[];
  extra?: boolean;
}

export interface EvalScope {
  vault: unknown;
  vars: Record<string, string>;
  last: unknown;
}

export const SCRIPT_METHOD = "__script__";

const VAR_PATTERN = /\{\{\s*([\w.-]+)\s*\}\}/g;

// Every property is optional for updateBot. Start empty so the user only sends
// the fields they intend to change.
const UPDATE_BOT_TEMPLATE = "{\n  \n}";

export const substitute = (text: string, vars: Record<string, string>) =>
  text.replace(VAR_PATTERN, (match, key: string) => (key in vars ? vars[key] : match));

export const unresolvedVars = (text: string, vars: Record<string, string>) => [
  ...new Set([...text.matchAll(VAR_PATTERN)].map((m) => m[1]).filter((key) => !(key in vars))),
];

export class ArgumentBuildError extends Error {
  argName: string;

  constructor(argName: string, message: string) {
    super(`Argument "${argName}": ${message}`);
    this.name = "ArgumentBuildError";
    this.argName = argName;
  }
}

const emptyFor = (type?: string): unknown => {
  const t = (type ?? "").toLowerCase();
  if (t === "number") return 0;
  if (t === "boolean") return false;
  if (/array|\[\]/.test(t)) return [];
  if (t.startsWith("object") || t.startsWith("{")) return {};
  return "";
};

const skeleton = (children: ParamDoc[]): Record<string, unknown> =>
  Object.fromEntries(
    children.map((child): [string, unknown] => [
      child.name,
      child.children.length ? skeleton(child.children) : emptyFor(child.type),
    ])
  );

export function createDrafts(method: MethodInfo, vars: Record<string, string>): ArgDraft[] {
  return method.params.map((param) => {
    const doc = method.paramDocs.find((d) => d.name === param.name);
    const type = (doc?.type ?? "").toLowerCase();
    const optional = Boolean(doc?.optional) || param.defaultValue !== undefined;
    const fromVar = param.name in vars ? `{{${param.name}}}` : "";

    let mode: ArgMode = "string";
    let value = fromVar;

    if (method.name === "updateBot" && param.name === "updates") {
      return { name: param.name, mode: "json", value: UPDATE_BOT_TEMPLATE };
    }

    if (type.includes("blob") || /^files?$/.test(param.name)) {
      mode = param.name === "files" ? "files" : "file";
      value = "";
    } else if (type === "number") {
      mode = "number";
      value = fromVar || param.defaultValue || "0";
    } else if (type === "boolean") {
      mode = "boolean";
      value = param.defaultValue === "false" ? "false" : "true";
    } else if (/object|array|\[\]|\{|</.test(type) && !type.includes("string")) {
      mode = "json";
      const shape = doc?.children.length ? skeleton(doc.children) : emptyFor(doc?.type) || {};
      value = JSON.stringify(shape, null, 2);
    } else {
      const literal = doc?.type?.match(/"([^"]*)"/)?.[1];
      const quotedDefault = param.defaultValue?.match(/^["'`](.*)["'`]$/)?.[1];
      value = fromVar || literal || quotedDefault || "";
    }

    return { name: param.name, mode: optional ? "undefined" : mode, value };
  });
}

export async function evaluate(body: string, scope: EvalScope): Promise<unknown> {
  const fn = new Function("vault", "vars", "last", `"use strict";\nreturn (async () => {\n${body}\n})();`);
  return fn(scope.vault, scope.vars, scope.last);
}

export async function resolveArg(draft: ArgDraft, scope: EvalScope): Promise<unknown> {
  const text = draft.mode === "js" ? draft.value : substitute(draft.value, scope.vars);
  switch (draft.mode) {
    case "string":
      return text;
    case "number":
      return Number(text);
    case "boolean":
      return text === "true";
    case "null":
      return null;
    case "undefined":
      return undefined;
    case "json":
      try {
        return JSON.parse(text);
      } catch (error) {
        throw new ArgumentBuildError(draft.name, `invalid JSON (${(error as Error).message})`);
      }
    case "file":
      return draft.files?.[0];
    case "files":
      return draft.files ?? [];
    case "js":
      try {
        return await evaluate(`return (${text.trim() || "undefined"}\n);`, scope);
      } catch (error) {
        throw new ArgumentBuildError(draft.name, `JS expression failed (${(error as Error).message})`);
      }
  }
}

export async function resolveArgs(drafts: ArgDraft[], scope: EvalScope): Promise<unknown[]> {
  const args: unknown[] = [];
  for (const draft of drafts) args.push(await resolveArg(draft, scope));
  while (args.length && args[args.length - 1] === undefined && drafts[args.length - 1]?.mode === "undefined") {
    args.pop();
  }
  return args;
}

const indent = (text: string, spaces: number) => text.replace(/\n/g, `\n${" ".repeat(spaces)}`);

function codeLiteral(draft: ArgDraft, vars: Record<string, string>): string {
  const text = draft.mode === "js" ? draft.value : substitute(draft.value, vars);
  switch (draft.mode) {
    case "string":
      return JSON.stringify(text);
    case "number":
      return /^-?\d+(\.\d+)?$/.test(text.trim()) ? text.trim() : `Number(${JSON.stringify(text)})`;
    case "boolean":
      return text === "true" ? "true" : "false";
    case "null":
      return "null";
    case "undefined":
      return "undefined";
    case "json":
      try {
        return JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        return text;
      }
    case "file":
      return JSON.stringify(`./${draft.files?.[0]?.name ?? draft.value ?? "file"}`);
    case "files":
      return `[${(draft.files?.map((f) => f.name) ?? draft.value.split(/,\s*/).filter(Boolean))
        .map((name) => JSON.stringify(`./${name}`))
        .join(", ")}]`;
    case "js":
      return `(${text.trim() || "undefined"})`;
  }
}

export function toCode(options: {
  method: string;
  drafts: ArgDraft[];
  script: string;
  vars: Record<string, string>;
  packageName: string;
  baseUrl: string;
  wsUrl: string;
}): string {
  const config = [
    `  VAULT_ACCESS_KEY: process.env.VAULT_ACCESS_KEY,`,
    `  VAULT_SECRET_KEY: process.env.VAULT_SECRET_KEY,`,
    `  VAULT_CLIENT_API_KEY: process.env.VAULT_CLIENT_API_KEY,`,
    `  VAULT_BASE_URL: ${JSON.stringify(options.baseUrl)},`,
    ...(options.wsUrl ? [`  VAULT_WS_URL: ${JSON.stringify(options.wsUrl)},`] : []),
  ].join("\n");

  const header = `import Vault from "${options.packageName}";\n\nconst vault = new Vault({\n${config}\n});\n\n`;

  if (options.method === SCRIPT_METHOD) {
    const vars = JSON.stringify(options.vars, null, 2);
    return `${header}const vars = ${vars};\n\nconst result = await (async () => {\n  ${indent(options.script.trim(), 2)}\n})();\nconsole.log(result);\n`;
  }

  const trimmed = [...options.drafts];
  while (trimmed.length && trimmed[trimmed.length - 1].mode === "undefined") trimmed.pop();
  const args = trimmed.map((draft) => codeLiteral(draft, options.vars));
  const multiline = args.some((arg) => arg.includes("\n")) || args.join(", ").length > 60;
  const call = multiline
    ? `vault.${options.method}(\n  ${args.map((arg) => indent(arg, 2)).join(",\n  ")}\n)`
    : `vault.${options.method}(${args.join(", ")})`;
  return `${header}const result = await ${call};\nconsole.log(result);\n`;
}
