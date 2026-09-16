import { useMemo, useState } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { getPath, stringify } from "@/sdk/serialize";
import { useTraffic } from "@/sdk/traffic";
import { useSession, type RunRecord } from "@/store/session";
import { useWorkspace } from "@/store/workspace";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatMs, formatTime } from "@/lib/format";
import { EmptyState, JsonView } from "@/components/common";
import { TrafficList } from "@/components/TrafficList";

const PHASE_LABEL = {
  constructor: "new Vault() threw — check the environment config",
  arguments: "Could not build the arguments — the SDK was not called",
  call: "The SDK threw",
};

export function ResponsePanel() {
  const selected = useWorkspace((s) => s.selected);
  const record = useSession((s) => s.results[selected]);
  const running = useSession((s) => (s.running[selected] ?? 0) > 0);

  if (!record) {
    return (
      <EmptyState>
        {running ? (
          <span className="flex items-center gap-2">
            <Loader2 className="size-4 animate-spin" /> Waiting for the SDK…
          </span>
        ) : (
          <>
            Send the call to see exactly what the SDK returns or throws, along with every HTTP request and socket
            frame it produced.
          </>
        )}
      </EmptyState>
    );
  }
  return <RunResult key={record.id} record={record} running={running} />;
}

function RunResult({ record, running }: { record: RunRecord; running: boolean }) {
  const allTraffic = useTraffic((s) => s.entries);
  const traffic = useMemo(
    () => allTraffic.filter((entry) => entry.ts >= record.startedAt && entry.ts <= record.endedAt),
    [allTraffic, record.startedAt, record.endedAt]
  );
  const resolved = record.outcome === "resolved";
  const error = record.error as { name?: string; message?: string; code?: string; status?: number } | undefined;

  return (
    <div className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        {resolved ? (
          <Badge className="bg-success text-white">
            <CheckCircle2 /> Resolved
          </Badge>
        ) : (
          <Badge variant="destructive">
            <XCircle /> Threw {error?.name ?? typeof record.error}
          </Badge>
        )}
        {!resolved && error?.code && <Badge variant="outline" className="font-mono">{error.code}</Badge>}
        {!resolved && error?.status && <Badge variant="outline" className="font-mono">HTTP {error.status}</Badge>}
        <span className="text-xs text-muted-foreground">
          {formatMs(record.durationMs)} · {formatTime(record.startedAt)} · {record.envName} · {record.sdkLabel}
        </span>
        {running && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" /> another call is running
          </span>
        )}
      </div>

      {!resolved && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
          <div className="text-[11px] font-medium text-destructive">{PHASE_LABEL[record.phase]}</div>
          <div className="font-mono text-xs break-words">{error?.message ?? String(record.error)}</div>
        </div>
      )}

      <Tabs defaultValue="result">
        <TabsList>
          <TabsTrigger value="result">{resolved ? "Returned value" : "Thrown error"}</TabsTrigger>
          <TabsTrigger value="traffic">Traffic ({traffic.length})</TabsTrigger>
          <TabsTrigger value="args">Arguments sent</TabsTrigger>
        </TabsList>
        <TabsContent value="result" className="space-y-3">
          {resolved && record.value !== undefined && <ExtractVariable value={record.value} />}
          {resolved && record.value === undefined ? (
            <p className="rounded-md border bg-card px-3 py-2 font-mono text-xs text-muted-foreground">
              undefined — this method resolves without a value
            </p>
          ) : (
            <JsonView value={resolved ? record.value : record.error} />
          )}
        </TabsContent>
        <TabsContent value="traffic">
          <div className="rounded-md border bg-card">
            <TrafficList
              entries={traffic}
              emptyText="No HTTP request, socket frame or SDK event happened during this call."
            />
          </div>
        </TabsContent>
        <TabsContent value="args">
          <JsonView value={record.args} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ExtractVariable({ value }: { value: unknown }) {
  const [path, setPath] = useState("");
  const [key, setKey] = useState("");
  const setVar = useWorkspace((s) => s.setVar);

  const apply = () => {
    const name = key.trim();
    if (!name) {
      toast.error("Give the variable a name");
      return;
    }
    const picked = getPath(value, path);
    if (picked === undefined) {
      toast.error(`Nothing at "${path || "(root)"}"`);
      return;
    }
    const text = typeof picked === "string" ? picked : stringify(picked);
    setVar(name, text);
    toast.success(`{{${name}}} = ${text.length > 60 ? `${text.slice(0, 60)}…` : text}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs">
      <span className="text-muted-foreground">Save</span>
      <Input
        value={path}
        onChange={(e) => setPath(e.target.value)}
        placeholder="data.vaultId  (blank = whole value)"
        className="h-7 w-64 font-mono text-xs"
      />
      <span className="text-muted-foreground">into variable</span>
      <Input
        value={key}
        onChange={(e) => setKey(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && apply()}
        placeholder="vaultId"
        className="h-7 w-36 font-mono text-xs"
      />
      <Button size="xs" variant="outline" onClick={apply}>
        Set
      </Button>
    </div>
  );
}
