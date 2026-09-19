import { useMemo, useState } from "react";
import { Bookmark, Loader2, Play, Plus, RotateCcw, X } from "lucide-react";
import type { LoadedSdk } from "@/sdk/loader";
import type { MethodInfo, ParamDoc } from "@/sdk/catalog";
import {
  ARG_MODES,
  createDrafts,
  SCRIPT_METHOD,
  substitute,
  toCode,
  unresolvedVars,
  type ArgDraft,
  type ArgMode,
} from "@/sdk/args";
import { runSelected } from "@/sdk/execute";
import { useSession } from "@/store/session";
import { useActiveEnv, useWorkspace, varsOf } from "@/store/workspace";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CodeBlock, EmptyState, NativeSelect } from "@/components/common";

export function RequestPanel({ sdk }: { sdk: LoadedSdk }) {
  const selected = useWorkspace((s) => s.selected);
  if (selected === SCRIPT_METHOD) return <ScriptRequest sdk={sdk} />;

  const method = sdk.methods.find((m) => m.name === selected);
  if (!method) {
    return (
      <EmptyState>
        {selected ? (
          <>
            <b className="font-mono">{selected}</b> does not exist in {sdk.label}. Pick another method or switch
            the SDK source.
          </>
        ) : (
          <>Pick an SDK method on the left. Every method on the Vault class is listed, internal ones included.</>
        )}
      </EmptyState>
    );
  }
  return <MethodRequest key={method.name} method={method} sdk={sdk} />;
}

function RunButton({ method }: { method: string }) {
  const running = useSession((s) => (s.running[method] ?? 0) > 0);
  return (
    <Button size="sm" onClick={() => void runSelected()} title="Send (Ctrl+Enter)">
      {running ? <Loader2 className="animate-spin" /> : <Play />}
      Send
    </Button>
  );
}

function SaveButton({ method, args, script }: { method: string; args: ArgDraft[]; script?: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const saveRequest = useWorkspace((s) => s.saveRequest);

  const submit = () => {
    saveRequest({ name: name.trim() || method, method, args, script });
    setOpen(false);
    setName("");
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Bookmark /> Save
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save request</DialogTitle>
            <DialogDescription>Keeps the method and its current arguments. Picked files are not stored.</DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={name}
            placeholder={method === SCRIPT_METHOD ? "Script" : method}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
          <DialogFooter>
            <Button onClick={submit}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function MethodRequest({ method, sdk }: { method: MethodInfo; sdk: LoadedSdk }) {
  const env = useActiveEnv();
  const vars = useMemo(() => varsOf(env), [env]);
  const stored = useWorkspace((s) => s.drafts[method.name]);
  const setDrafts = useWorkspace((s) => s.setDrafts);
  const resetDrafts = useWorkspace((s) => s.resetDrafts);
  const initial = useMemo(() => createDrafts(method, vars), [method, vars]);
  const rows = stored ?? initial;

  const commit = (next: ArgDraft[]) => setDrafts(method.name, next);
  const update = (index: number, patch: Partial<ArgDraft>) =>
    commit(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const addExtra = () => commit([...rows, { name: `arg${rows.length}`, mode: "string", value: "", extra: true }]);
  const remove = (index: number) => commit(rows.filter((_, i) => i !== index));

  const code = toCode({
    method: method.name,
    drafts: rows,
    script: "",
    vars,
    packageName: sdk.packageName,
    baseUrl: env.config.VAULT_BASE_URL,
    wsUrl: env.config.VAULT_WS_URL,
  });

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="font-mono text-base break-all">
            <span className="text-muted-foreground">vault.</span>
            <span className="font-semibold">{method.name}</span>
            <span className="text-muted-foreground">
              ({method.params.map((p) => `${p.rest ? "..." : ""}${p.name}${p.defaultValue ? ` = ${p.defaultValue}` : ""}`).join(", ")})
            </span>
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge variant="outline">{method.group}</Badge>
            <Badge variant="outline">{method.isAsync ? "async" : "sync"}</Badge>
            {method.internal && <Badge variant="secondary">internal</Badge>}
            {method.returns?.type && (
              <span className="font-mono text-xs text-muted-foreground">→ {method.returns.type}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => resetDrafts(method.name)} title="Rebuild arguments from the method signature">
            <RotateCcw /> Reset
          </Button>
          <SaveButton method={method.name} args={rows} />
          <RunButton method={method.name} />
        </div>
      </div>

      {method.summary && <p className="text-sm whitespace-pre-line text-muted-foreground">{method.summary}</p>}

      <Tabs defaultValue="args">
        <TabsList>
          <TabsTrigger value="args">Arguments ({rows.length})</TabsTrigger>
          <TabsTrigger value="docs">Docs</TabsTrigger>
          <TabsTrigger value="code">Code</TabsTrigger>
        </TabsList>

        <TabsContent value="args">
          <div className="rounded-md border bg-card">
            {rows.length === 0 && (
              <p className="px-4 py-3 text-sm text-muted-foreground">This method takes no arguments.</p>
            )}
            {rows.map((row, index) => (
              <ArgRow
                key={index}
                index={index}
                draft={row}
                doc={
                  method.name === "updateBot" && row.name === "updates"
                    ? {
                        name: row.name,
                        type: "Object",
                        optional: false,
                        description:
                          "Optional fields: name, description, profession, useLLMFallback, wordLimit. Add only the fields you want to change; {} is valid.",
                        children: [],
                      }
                    : method.paramDocs.find((d) => d.name === row.name)
                }
                vars={vars}
                onChange={(patch) => update(index, patch)}
                onRemove={() => remove(index)}
              />
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between">
            <Button variant="ghost" size="xs" onClick={addExtra}>
              <Plus /> Add extra argument
            </Button>
            <span className="text-[11px] text-muted-foreground">
              Use <code className="font-mono">{"{{name}}"}</code> for environment variables · trailing
              <code className="font-mono"> undefined</code> arguments are omitted
            </span>
          </div>
        </TabsContent>

        <TabsContent value="docs">
          <MethodDocs method={method} />
        </TabsContent>

        <TabsContent value="code">
          <CodeBlock text={code} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ArgRow({
  index,
  draft,
  doc,
  vars,
  onChange,
  onRemove,
}: {
  index: number;
  draft: ArgDraft;
  doc?: ParamDoc;
  vars: Record<string, string>;
  onChange: (patch: Partial<ArgDraft>) => void;
  onRemove: () => void;
}) {
  const missing = draft.mode === "js" ? [] : unresolvedVars(draft.value, vars);
  const jsonError = useMemo(() => {
    if (draft.mode !== "json") return null;
    try {
      JSON.parse(substitute(draft.value, vars));
      return null;
    } catch (error) {
      return (error as Error).message;
    }
  }, [draft.mode, draft.value, vars]);

  const formatJson = () => {
    try {
      onChange({ value: JSON.stringify(JSON.parse(draft.value), null, 2) });
    } catch {
      // Leave text alone when it only parses after variable substitution.
    }
  };

  return (
    <div className="grid gap-3 border-b px-4 py-3 last:border-b-0 md:grid-cols-[minmax(150px,200px)_130px_1fr_auto]">
      <div className="min-w-0">
        {draft.extra ? (
          <Input
            value={draft.name}
            onChange={(e) => onChange({ name: e.target.value })}
            className="h-7 font-mono text-xs"
          />
        ) : (
          <div className="font-mono text-sm">
            <span className="text-muted-foreground">{index}.</span> {draft.name}
            {doc?.optional && <span className="text-muted-foreground">?</span>}
          </div>
        )}
        {doc?.type && <div className="font-mono text-[11px] break-words text-primary">{doc.type}</div>}
        {doc?.description && <div className="mt-0.5 text-[11px] text-muted-foreground">{doc.description}</div>}
      </div>

      <NativeSelect value={draft.mode} onChange={(e) => onChange({ mode: e.target.value as ArgMode })} className="w-full">
        {ARG_MODES.map((mode) => (
          <option key={mode.value} value={mode.value}>
            {mode.label}
          </option>
        ))}
      </NativeSelect>

      <div className="min-w-0 space-y-1">
        <ArgEditor draft={draft} onChange={onChange} onFormat={formatJson} />
        {jsonError && <p className="text-[11px] text-destructive">Invalid JSON: {jsonError} (it will still be sent if you insist)</p>}
        {missing.length > 0 && (
          <p className="text-[11px] text-warning">
            Not defined in this environment: {missing.map((key) => `{{${key}}}`).join(", ")}. Sent as literal text.
          </p>
        )}
      </div>

      <div className="w-7">
        {draft.extra && (
          <Button variant="ghost" size="icon-xs" onClick={onRemove} aria-label="Remove argument">
            <X />
          </Button>
        )}
      </div>
    </div>
  );
}

function ArgEditor({
  draft,
  onChange,
  onFormat,
}: {
  draft: ArgDraft;
  onChange: (patch: Partial<ArgDraft>) => void;
  onFormat: () => void;
}) {
  switch (draft.mode) {
    case "string":
      return (
        <Textarea
          rows={1}
          value={draft.value}
          onChange={(e) => onChange({ value: e.target.value })}
          className="min-h-8 py-1.5 font-mono text-xs"
          placeholder='""  (empty string)'
          spellCheck={false}
        />
      );
    case "number":
      return (
        <Input value={draft.value} onChange={(e) => onChange({ value: e.target.value })} className="h-8 font-mono text-xs" />
      );
    case "boolean":
      return (
        <NativeSelect value={draft.value === "true" ? "true" : "false"} onChange={(e) => onChange({ value: e.target.value })}>
          <option value="true">true</option>
          <option value="false">false</option>
        </NativeSelect>
      );
    case "json":
      return (
        <div className="relative">
          <Textarea
            value={draft.value}
            onChange={(e) => onChange({ value: e.target.value })}
            className="min-h-20 font-mono text-xs"
            spellCheck={false}
          />
          <Button variant="ghost" size="xs" className="absolute top-1 right-1" onClick={onFormat}>
            Format
          </Button>
        </div>
      );
    case "js":
      return (
        <Textarea
          value={draft.value}
          onChange={(e) => onChange({ value: e.target.value })}
          className="min-h-16 font-mono text-xs"
          placeholder={'In scope: vault, vars, last\ne.g. last.data.items.map(i => i.id)\nor  new File(["hello"], "hello.txt")'}
          spellCheck={false}
        />
      );
    case "file":
    case "files":
      return <FilePicker draft={draft} onChange={onChange} />;
    default:
      return (
        <p className="py-1.5 font-mono text-xs text-muted-foreground italic">passes {draft.mode}</p>
      );
  }
}

function FilePicker({ draft, onChange }: { draft: ArgDraft; onChange: (patch: Partial<ArgDraft>) => void }) {
  const multiple = draft.mode === "files";
  const files = draft.files ?? [];
  return (
    <div className="space-y-1">
      <input
        type="file"
        multiple={multiple}
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? []);
          const next = multiple ? [...files, ...picked] : picked.slice(0, 1);
          onChange({ files: next, value: next.map((f) => f.name).join(", ") });
          e.target.value = "";
        }}
        className="block w-full text-xs file:mr-2 file:rounded file:border file:bg-muted file:px-2 file:py-1 file:text-xs"
      />
      {files.map((file, i) => (
        <div key={`${file.name}-${i}`} className="flex items-center gap-2 font-mono text-[11px]">
          <span className="truncate">{file.name}</span>
          <span className="text-muted-foreground">{(file.size / 1024).toFixed(1)} KB · {file.type || "no type"}</span>
          <button
            type="button"
            className="text-muted-foreground hover:text-destructive"
            onClick={() => {
              const next = files.filter((_, idx) => idx !== i);
              onChange({ files: next, value: next.map((f) => f.name).join(", ") });
            }}
            aria-label={`Remove ${file.name}`}
          >
            <X className="size-3" />
          </button>
        </div>
      ))}
      {!files.length && draft.value && (
        <p className="text-[11px] text-warning">Previously used: {draft.value}. Pick the file again, browsers can't keep it.</p>
      )}
      {!files.length && !draft.value && (
        <p className="text-[11px] text-muted-foreground">
          Nothing picked: {multiple ? "an empty array" : "undefined"} is sent.
        </p>
      )}
    </div>
  );
}

function ParamDocList({ params, prefix = "" }: { params: ParamDoc[]; prefix?: string }) {
  return (
    <ul className="space-y-1.5">
      {params.map((param) => (
        <li key={prefix + param.name}>
          <div className="font-mono text-xs">
            {prefix}
            {param.name}
            {param.optional && "?"}
            {param.type && <span className="text-primary">: {param.type}</span>}
            {param.defaultValue && <span className="text-muted-foreground"> = {param.defaultValue}</span>}
          </div>
          {param.description && <div className="text-xs text-muted-foreground">{param.description}</div>}
          {param.children.length > 0 && (
            <div className="mt-1 border-l pl-3">
              <ParamDocList params={param.children} prefix={`${prefix}${param.name}.`} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function MethodDocs({ method }: { method: MethodInfo }) {
  const hasDocs =
    method.paramDocs.length || method.returns || method.examples.length || method.throws.length || method.summary;
  if (!hasDocs) {
    return (
      <p className="text-sm text-muted-foreground">
        No JSDoc for this method in the SDK source. Signature: <code className="font-mono">{method.name}({method.params.map((p) => p.name).join(", ")})</code>
      </p>
    );
  }
  return (
    <div className="space-y-4 rounded-md border bg-card p-4 text-sm">
      {method.paramDocs.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold text-muted-foreground uppercase">Parameters</h3>
          <ParamDocList params={method.paramDocs} />
        </section>
      )}
      {method.returns && (
        <section>
          <h3 className="mb-1 text-xs font-semibold text-muted-foreground uppercase">Returns</h3>
          <p className="text-xs">
            {method.returns.type && <code className="font-mono text-primary">{method.returns.type}</code>} {method.returns.description}
          </p>
        </section>
      )}
      {method.throws.length > 0 && (
        <section>
          <h3 className="mb-1 text-xs font-semibold text-muted-foreground uppercase">Throws</h3>
          <ul className="list-disc pl-5 text-xs">
            {method.throws.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </section>
      )}
      {method.examples.map((example, i) => (
        <section key={i}>
          <h3 className="mb-1 text-xs font-semibold text-muted-foreground uppercase">Example</h3>
          <pre className="overflow-auto rounded bg-muted p-2 font-mono text-xs">{example}</pre>
        </section>
      ))}
    </div>
  );
}

function ScriptRequest({ sdk }: { sdk: LoadedSdk }) {
  const env = useActiveEnv();
  const vars = useMemo(() => varsOf(env), [env]);
  const script = useWorkspace((s) => s.script);
  const setScript = useWorkspace((s) => s.setScript);

  return (
    <div className="space-y-3 p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex-1">
          <h2 className="text-base font-semibold">Script</h2>
          <p className="text-sm text-muted-foreground">
            Async JavaScript with <code className="font-mono">vault</code> (the live SDK instance),{" "}
            <code className="font-mono">vars</code> and <code className="font-mono">last</code> in scope. Chain calls,
            poke at instance fields, subscribe to events. Whatever you <code className="font-mono">return</code> is
            shown as the result.
          </p>
        </div>
        <SaveButton method={SCRIPT_METHOD} args={[]} script={script} />
        <RunButton method={SCRIPT_METHOD} />
      </div>
      <Tabs defaultValue="editor">
        <TabsList>
          <TabsTrigger value="editor">Editor</TabsTrigger>
          <TabsTrigger value="code">Standalone code</TabsTrigger>
        </TabsList>
        <TabsContent value="editor">
          <Textarea
            value={script}
            onChange={(e) => setScript(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Tab") {
                e.preventDefault();
                const el = e.currentTarget;
                const { selectionStart, selectionEnd } = el;
                setScript(`${script.slice(0, selectionStart)}  ${script.slice(selectionEnd)}`);
                requestAnimationFrame(() => el.setSelectionRange(selectionStart + 2, selectionStart + 2));
              }
            }}
            className="min-h-72 font-mono text-xs leading-relaxed"
            spellCheck={false}
          />
        </TabsContent>
        <TabsContent value="code">
          <CodeBlock
            text={toCode({
              method: SCRIPT_METHOD,
              drafts: [],
              script,
              vars,
              packageName: sdk.packageName,
              baseUrl: env.config.VAULT_BASE_URL,
              wsUrl: env.config.VAULT_WS_URL,
            })}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
