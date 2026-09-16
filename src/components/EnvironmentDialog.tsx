import { useState } from "react";
import { Copy, Eye, EyeOff, Plus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { SDK_SOURCES, type SdkSourceId } from "@/sdk/sources";
import {
  newEnvironment,
  SECRET_FIELDS,
  uid,
  useWorkspace,
  type EnvConfig,
  type Environment,
} from "@/store/workspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NativeSelect } from "@/components/common";

const PRESETS: { label: string; base: string; ws: string }[] = [
  { label: "Gateway :8000", base: "http://localhost:8000", ws: "ws://localhost:8000/ws/chat" },
  { label: "Vault direct :7000", base: "http://localhost:7000/api", ws: "ws://localhost:7000/ws/chat" },
];

const SECRET_LABELS: Record<(typeof SECRET_FIELDS)[number], string> = {
  VAULT_ACCESS_KEY: "Access key",
  VAULT_SECRET_KEY: "Secret key",
  VAULT_CLIENT_API_KEY: "Client API key",
};

export function EnvironmentDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const environments = useWorkspace((s) => s.environments);
  const activeEnvId = useWorkspace((s) => s.activeEnvId);
  const setActiveEnv = useWorkspace((s) => s.setActiveEnv);
  const addEnvironment = useWorkspace((s) => s.addEnvironment);
  const [editingId, setEditingId] = useState(activeEnvId);
  const env = environments.find((e) => e.id === editingId) ?? environments[0];

  const create = (base?: Environment) => {
    const next = base
      ? { ...structuredClone(base), id: uid(), name: `${base.name} copy` }
      : newEnvironment(`Environment ${environments.length + 1}`);
    addEnvironment(next);
    setEditingId(next.id);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-hidden p-0 sm:max-w-4xl">
        <DialogHeader className="border-b px-6 pt-5 pb-3">
          <DialogTitle>Environments</DialogTitle>
          <DialogDescription>
            Credentials, SDK source and variables per target. Values are saved in this browser only. Changing
            anything here gives the next call a fresh SDK instance.
          </DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[calc(90vh-6rem)] grid-cols-[200px_1fr] overflow-hidden">
          <div className="overflow-y-auto border-r p-2">
            {environments.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => setEditingId(e.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent",
                  e.id === env.id && "bg-accent"
                )}
              >
                <span className="truncate">{e.name}</span>
                {e.id === activeEnvId && <span className="ml-auto text-[10px] text-primary">active</span>}
              </button>
            ))}
            <Button variant="ghost" size="sm" className="mt-2 w-full justify-start" onClick={() => create()}>
              <Plus /> New
            </Button>
          </div>
          <div className="overflow-y-auto p-6">
            <EnvironmentForm
              key={env.id}
              env={env}
              isActive={env.id === activeEnvId}
              onActivate={() => setActiveEnv(env.id)}
              onDuplicate={() => create(env)}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EnvironmentForm({
  env,
  isActive,
  onActivate,
  onDuplicate,
}: {
  env: Environment;
  isActive: boolean;
  onActivate: () => void;
  onDuplicate: () => void;
}) {
  const updateEnvironment = useWorkspace((s) => s.updateEnvironment);
  const removeEnvironment = useWorkspace((s) => s.removeEnvironment);
  const [reveal, setReveal] = useState(false);

  const patch = (changes: Partial<Environment>) => updateEnvironment(env.id, changes);
  const setConfig = (field: keyof EnvConfig, value: string) => patch({ config: { ...env.config, [field]: value } });
  const setVarAt = (index: number, changes: Partial<Environment["vars"][number]>) =>
    patch({ vars: env.vars.map((v, i) => (i === index ? { ...v, ...changes } : v)) });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-48 flex-1 space-y-1.5">
          <Label>Name</Label>
          <Input value={env.name} onChange={(e) => patch({ name: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>SDK source</Label>
          <NativeSelect
            value={env.source}
            onChange={(e) => patch({ source: e.target.value as SdkSourceId })}
            className="h-9"
          >
            {SDK_SOURCES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">Endpoints</span>
          {PRESETS.map((preset) => (
            <Button
              key={preset.label}
              variant="outline"
              size="xs"
              onClick={() =>
                patch({ config: { ...env.config, VAULT_BASE_URL: preset.base, VAULT_WS_URL: preset.ws } })
              }
            >
              {preset.label}
            </Button>
          ))}
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="font-mono text-xs">VAULT_BASE_URL</Label>
            <Input value={env.config.VAULT_BASE_URL} onChange={(e) => setConfig("VAULT_BASE_URL", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="font-mono text-xs">VAULT_WS_URL (optional)</Label>
            <Input value={env.config.VAULT_WS_URL} onChange={(e) => setConfig("VAULT_WS_URL", e.target.value)} />
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Credentials</span>
          <Button variant="ghost" size="xs" onClick={() => setReveal((v) => !v)}>
            {reveal ? <EyeOff /> : <Eye />} {reveal ? "Hide" : "Show"}
          </Button>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {SECRET_FIELDS.map((field) => (
            <div key={field} className="space-y-1.5">
              <Label className="text-xs">{SECRET_LABELS[field]}</Label>
              <Input
                type={reveal ? "text" : "password"}
                autoComplete="off"
                spellCheck={false}
                value={env.config[field]}
                onChange={(e) => setConfig(field, e.target.value)}
                className="font-mono text-xs"
              />
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Leave any of these empty or wrong on purpose to see how the SDK reacts. Nothing is validated here.
        </p>
      </div>

      <div className="space-y-2">
        <span className="text-sm font-medium">Variables</span>
        <p className="text-[11px] text-muted-foreground">
          Reference as <code className="font-mono">{"{{key}}"}</code> in String, Number and JSON arguments, or as{" "}
          <code className="font-mono">vars.key</code> in JS. A parameter with the same name as a variable is
          prefilled with it.
        </p>
        <div className="space-y-1.5">
          {env.vars.map((v, index) => (
            <div key={index} className="flex gap-2">
              <Input
                value={v.key}
                placeholder="key"
                onChange={(e) => setVarAt(index, { key: e.target.value })}
                className="h-8 w-44 font-mono text-xs"
              />
              <Input
                value={v.value}
                placeholder="value"
                onChange={(e) => setVarAt(index, { value: e.target.value })}
                className="h-8 flex-1 font-mono text-xs"
              />
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => patch({ vars: env.vars.filter((_, i) => i !== index) })}
                aria-label={`Remove ${v.key}`}
              >
                <X />
              </Button>
            </div>
          ))}
          <Button variant="ghost" size="xs" onClick={() => patch({ vars: [...env.vars, { key: "", value: "" }] })}>
            <Plus /> Add variable
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-t pt-4">
        <Button onClick={onActivate} disabled={isActive}>
          {isActive ? "Active environment" : "Use this environment"}
        </Button>
        <Button variant="outline" onClick={onDuplicate}>
          <Copy /> Duplicate
        </Button>
        <Button variant="ghost" className="ml-auto text-destructive" onClick={() => removeEnvironment(env.id)}>
          <Trash2 /> Delete
        </Button>
      </div>
    </div>
  );
}
