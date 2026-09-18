export interface ParamDoc {
  name: string;
  type?: string;
  optional: boolean;
  defaultValue?: string;
  description: string;
  children: ParamDoc[];
}

export interface SignatureParam {
  name: string;
  defaultValue?: string;
  rest: boolean;
}

export interface MethodInfo {
  name: string;
  group: string;
  isAsync: boolean;
  internal: boolean;
  inherited: boolean;
  params: SignatureParam[];
  summary: string;
  paramDocs: ParamDoc[];
  returns?: { type?: string; description: string };
  throws: string[];
  examples: string[];
}

export const CORE_GROUP = "Core";
export const INHERITED_GROUP = "EventEmitter (inherited)";
export const BOT_LLM_GROUP = "Bot LLM";
export const BOT_LLM_METHODS = new Set([
  "setBotLlm",
  "testBotLlm",
  "setBotLlmEnabled",
  "clearBotLlm",
  "getLlmProviders",
]);
const UNLISTED_GROUP = "Not found in source";
const NOT_METHODS = new Set(["constructor", "if", "for", "while", "switch", "catch", "function", "return"]);

function findClosing(text: string, openIndex: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = openIndex; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") quote = ch;
    else if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let current = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      current += ch;
      if (ch === "\\") current += text[++i] ?? "";
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") quote = ch;
    else if ("([{".includes(ch)) depth++;
    else if (")]}".includes(ch)) depth--;
    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter(Boolean);
}

function parseParams(paramText: string): SignatureParam[] {
  return splitTopLevel(paramText.replace(/\/\*[\s\S]*?\*\//g, "")).map((part) => {
    const rest = part.startsWith("...");
    const body = rest ? part.slice(3) : part;
    const eq = body.search(/=(?!>)/);
    return eq === -1
      ? { name: body.trim(), rest }
      : { name: body.slice(0, eq).trim(), defaultValue: body.slice(eq + 1).trim(), rest };
  });
}

function paramsFromFunction(fn: unknown): SignatureParam[] {
  const text = Function.prototype.toString.call(fn);
  const open = text.indexOf("(");
  const close = open === -1 ? -1 : findClosing(text, open);
  return close === -1 ? [] : parseParams(text.slice(open + 1, close));
}

const TYPE = String.raw`\{((?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*)\}`;
const PARAM_TAG = new RegExp(String.raw`^(?:${TYPE}\s*)?(\[)?([\w$.]+)(?:=([^\]]*))?\]?\s*(?:-\s*)?([\s\S]*)$`);
const RETURNS_TAG = new RegExp(String.raw`^(?:${TYPE}\s*)?([\s\S]*)$`);

function dedent(text: string): string {
  const lines = text.replace(/^\n+|\s+$/g, "").split("\n");
  const indent = Math.min(
    ...lines.filter((line) => line.trim()).map((line) => line.match(/^ */)?.[0].length ?? 0)
  );
  return lines.map((line) => line.slice(Number.isFinite(indent) ? indent : 0)).join("\n");
}

interface ParsedDoc {
  summary: string;
  paramDocs: ParamDoc[];
  returns?: { type?: string; description: string };
  throws: string[];
  examples: string[];
  isPrivate: boolean;
}

function parseJsDoc(block: string): ParsedDoc {
  const lines = block
    .replace(/^\/\*\*/, "")
    .replace(/\*\/$/, "")
    .split("\n")
    .map((line) => line.replace(/^\s*\* ?/, ""));

  const summary: string[] = [];
  const tags: { tag: string; text: string }[] = [];
  for (const line of lines) {
    const tag = line.match(/^@(\w+)\s?(.*)$/);
    if (tag) tags.push({ tag: tag[1], text: tag[2] });
    else if (tags.length) tags[tags.length - 1].text += `\n${line}`;
    else summary.push(line);
  }

  const doc: ParsedDoc = {
    summary: summary.join("\n").trim(),
    paramDocs: [],
    throws: [],
    examples: [],
    isPrivate: false,
  };
  const flat = new Map<string, ParamDoc>();

  for (const { tag, text } of tags) {
    const oneLine = text.replace(/\s*\n\s*/g, " ").trim();
    if (tag === "param") {
      const match = oneLine.match(PARAM_TAG);
      if (!match) continue;
      const [, type, bracket, fullName, defaultValue, description] = match;
      const param: ParamDoc = {
        name: fullName.split(".").pop() ?? fullName,
        type: type?.trim(),
        optional: Boolean(bracket),
        defaultValue: defaultValue?.trim(),
        description: description.trim(),
        children: [],
      };
      flat.set(fullName, param);
      const parentName = fullName.includes(".") ? fullName.slice(0, fullName.lastIndexOf(".")) : null;
      const parent = parentName ? flat.get(parentName) : undefined;
      if (parent) parent.children.push(param);
      else if (!parentName) doc.paramDocs.push(param);
    } else if (tag === "returns" || tag === "return") {
      const match = oneLine.match(RETURNS_TAG);
      doc.returns = { type: match?.[1]?.trim(), description: match?.[2]?.trim() ?? "" };
    } else if (tag === "throws") {
      doc.throws.push(oneLine);
    } else if (tag === "example") {
      doc.examples.push(dedent(text));
    } else if (tag === "private") {
      doc.isPrivate = true;
    }
  }
  return doc;
}

/**
 * The method list is read from the SDK's own source, so it always matches the
 * build that is loaded. The prototype is the ground truth for what exists.
 */
export function buildCatalog(rawSource: string, VaultClass: { prototype: object }): MethodInfo[] {
  const source = rawSource.replace(/\r\n?/g, "\n");
  const proto = VaultClass.prototype as Record<string, unknown>;
  const sections = [...source.matchAll(/\/\/\s*─+\s*(.+?)\s*─+/g)].map((m) => ({
    index: m.index ?? 0,
    title: m[1],
  }));

  const methods: MethodInfo[] = [];
  const seen = new Set<string>();

  for (const match of source.matchAll(/^ {2}(async\s+)?([A-Za-z_$][\w$]*)\s*\(/gm)) {
    const name = match[2];
    if (NOT_METHODS.has(name) || seen.has(name) || typeof proto[name] !== "function") continue;

    const index = match.index ?? 0;
    const open = index + match[0].length - 1;
    const close = findClosing(source, open);
    if (close === -1 || !/^\s*\{/.test(source.slice(close + 1, close + 20))) continue;
    seen.add(name);

    const before = source.slice(0, index).trimEnd();
    const doc = before.endsWith("*/")
      ? parseJsDoc(before.slice(before.lastIndexOf("/**")))
      : { summary: "", paramDocs: [], throws: [], examples: [], isPrivate: false };

    methods.push({
      name,
      group: BOT_LLM_METHODS.has(name)
        ? BOT_LLM_GROUP
        : sections.filter((s) => s.index < index).pop()?.title ?? CORE_GROUP,
      isAsync: Boolean(match[1]),
      internal: doc.isPrivate || /^internal\b/i.test(doc.summary),
      inherited: false,
      params: parseParams(source.slice(open + 1, close)),
      summary: doc.summary,
      paramDocs: doc.paramDocs,
      returns: doc.returns,
      throws: doc.throws,
      examples: doc.examples,
    });
  }

  const describe = (name: string, fn: unknown, group: string, inherited: boolean): MethodInfo => ({
    name,
    group,
    isAsync: (fn as { constructor?: { name?: string } }).constructor?.name === "AsyncFunction",
    internal: name.startsWith("_"),
    inherited,
    params: paramsFromFunction(fn),
    summary: "",
    paramDocs: [],
    throws: [],
    examples: [],
  });

  for (const name of Object.getOwnPropertyNames(proto)) {
    if (name !== "constructor" && !seen.has(name) && typeof proto[name] === "function") {
      methods.push(describe(name, proto[name], UNLISTED_GROUP, false));
    }
  }

  const parent = Object.getPrototypeOf(proto) as Record<string, unknown> | null;
  if (parent && parent !== Object.prototype) {
    for (const name of Object.getOwnPropertyNames(parent).sort()) {
      if (name !== "constructor" && !name.startsWith("_") && typeof parent[name] === "function") {
        methods.push(describe(name, parent[name], INHERITED_GROUP, true));
      }
    }
  }

  return methods;
}
