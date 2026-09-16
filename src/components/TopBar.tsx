import { useEffect, useRef, useState } from "react";
import { Braces, Download, EllipsisVertical, Power, Settings2, Upload } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { SdkLoadState } from "@/sdk/loader";
import { disposeVault, peekVault } from "@/sdk/runtime";
import { SDK_SOURCES, type SdkSourceId } from "@/sdk/sources";
import { SECRET_FIELDS, useActiveEnv, useWorkspace, type Environment } from "@/store/workspace";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NativeSelect } from "@/components/common";
import { EnvironmentDialog } from "@/components/EnvironmentDialog";
import { ThemeToggle } from "@/components/ThemeToggle";

const SOCKET_STATE = ["connecting", "open", "closing", "closed"];

function useInstanceStatus() {
  const [status, setStatus] = useState({ live: false, ws: -1, botChat: -1 });
  useEffect(() => {
    const timer = setInterval(() => {
      const current = peekVault();
      const next = {
        live: Boolean(current),
        ws: current?.instance.ws?.readyState ?? -1,
        botChat: current?.instance.botChatWs?.readyState ?? -1,
      };
      setStatus((prev) =>
        prev.live === next.live && prev.ws === next.ws && prev.botChat === next.botChat ? prev : next
      );
    }, 700);
    return () => clearInterval(timer);
  }, []);
  return status;
}

function SocketPill({ label, state }: { label: string; state: number }) {
  return (
    <span className="flex items-center gap-1 text-[11px] text-muted-foreground" title={`${label}: ${SOCKET_STATE[state] ?? "not opened"}`}>
      <span
        className={cn(
          "size-2 rounded-full",
          state === 1 ? "bg-success" : state === 0 ? "bg-warning" : "bg-muted-foreground/30"
        )}
      />
      {label}
    </span>
  );
}

function download(filename: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function TopBar({ sdkState }: { sdkState: SdkLoadState }) {
  const env = useActiveEnv();
  const environments = useWorkspace((s) => s.environments);
  const setActiveEnv = useWorkspace((s) => s.setActiveEnv);
  const updateEnvironment = useWorkspace((s) => s.updateEnvironment);
  const importWorkspace = useWorkspace((s) => s.importWorkspace);
  const [envOpen, setEnvOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const status = useInstanceStatus();

  const exportWorkspace = (withSecrets: boolean) => {
    const { environments: envs, saved } = useWorkspace.getState();
    const scrub = (e: Environment): Environment => ({
      ...e,
      config: { ...e.config, ...Object.fromEntries(SECRET_FIELDS.map((field) => [field, ""])) },
    });
    download(`vault-sdk-playground${withSecrets ? "-with-secrets" : ""}.json`, {
      environments: withSecrets ? envs : envs.map(scrub),
      saved,
    });
  };

  const onImport = async (file: File) => {
    try {
      const data = JSON.parse(await file.text());
      importWorkspace({ environments: data.environments, saved: data.saved });
      toast.success("Imported environments and saved requests");
    } catch (error) {
      toast.error(`Import failed: ${(error as Error).message}`);
    }
  };

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b bg-card px-4">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Braces className="size-4 text-primary" /> Vault SDK Playground
      </div>

      <div className="ml-4 flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground">Environment</span>
        <NativeSelect value={env.id} onChange={(e) => setActiveEnv(e.target.value)} className="max-w-48">
          {environments.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </NativeSelect>
        <Button variant="outline" size="sm" onClick={() => setEnvOpen(true)}>
          <Settings2 /> Edit
        </Button>
      </div>

      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground">SDK</span>
        <NativeSelect
          value={env.source}
          onChange={(e) => updateEnvironment(env.id, { source: e.target.value as SdkSourceId })}
        >
          {SDK_SOURCES.map((s) => (
            <option key={s.id} value={s.id} title={s.description}>
              {s.label}
            </option>
          ))}
        </NativeSelect>
        {sdkState.status === "ready" && (
          <Badge variant="outline" className="font-mono">
            v{sdkState.sdk.version}
          </Badge>
        )}
      </div>

      <div className="ml-auto flex items-center gap-3">
        <span className="text-[11px] text-muted-foreground">
          Instance: {status.live ? <span className="text-success">live</span> : "created on first call"}
        </span>
        <SocketPill label="ws" state={status.ws} />
        <SocketPill label="bot chat" state={status.botChat} />
        <Button
          variant="outline"
          size="sm"
          disabled={!status.live}
          onClick={() => {
            disposeVault();
            toast.success("SDK instance discarded and sockets closed");
          }}
          title="Close sockets and discard the SDK instance"
        >
          <Power /> Reset
        </Button>

        <ThemeToggle />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Workspace menu">
              <EllipsisVertical />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => exportWorkspace(false)}>
              <Download /> Export (without keys)
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => exportWorkspace(true)}>
              <Download /> Export including keys
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => fileInput.current?.click()}>
              <Upload /> Import…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <input
          ref={fileInput}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onImport(file);
            e.target.value = "";
          }}
        />
      </div>

      <EnvironmentDialog open={envOpen} onOpenChange={setEnvOpen} />
    </header>
  );
}
