import { ArrowDown, ArrowUp, Diamond, Plug, PlugZap, Unplug, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TrafficEntry, WsPhase } from "@/sdk/traffic";
import { preview } from "@/sdk/serialize";
import { formatMs, formatTime } from "@/lib/format";
import { JsonView } from "@/components/common";

const WS_ICON: Record<WsPhase, typeof Plug> = {
  connect: Plug,
  open: PlugZap,
  out: ArrowUp,
  in: ArrowDown,
  close: Unplug,
  error: TriangleAlert,
};

const WS_LABEL: Record<WsPhase, string> = {
  connect: "CONNECT",
  open: "OPEN",
  out: "SEND",
  in: "RECV",
  close: "CLOSE",
  error: "ERROR",
};

const pathOf = (url: string) => {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
};

function Section({ title, value }: { title: string; value: unknown }) {
  if (value === undefined) return null;
  return (
    <div>
      <div className="mb-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">{title}</div>
      <JsonView value={value} />
    </div>
  );
}

function Row({ entry }: { entry: TrafficEntry }) {
  let summary;
  let body;

  if (entry.kind === "http") {
    const failed = entry.error || (entry.status ?? 0) >= 400;
    summary = (
      <>
        <span className="w-12 shrink-0 font-semibold">{entry.method}</span>
        <span
          className={cn(
            "w-10 shrink-0",
            entry.pending ? "text-muted-foreground" : failed ? "text-destructive" : "text-success"
          )}
        >
          {entry.pending ? "…" : entry.status ?? "ERR"}
        </span>
        <span className="min-w-0 flex-1 truncate" title={entry.url}>
          {pathOf(entry.url)}
        </span>
        {entry.durationMs !== undefined && (
          <span className="shrink-0 text-muted-foreground">{formatMs(entry.durationMs)}</span>
        )}
      </>
    );
    body = (
      <>
        <div className="font-mono text-[11px] break-all">{entry.url}</div>
        {entry.error && <div className="text-xs text-destructive">{entry.error}</div>}
        <Section title="Request headers" value={entry.requestHeaders} />
        <Section title="Request body" value={entry.requestBody} />
        <Section title="Response headers" value={entry.responseHeaders} />
        <Section title="Response body" value={entry.responseBody} />
      </>
    );
  } else if (entry.kind === "ws") {
    const Icon = WS_ICON[entry.phase];
    summary = (
      <>
        <Icon className={cn("size-3.5 shrink-0", entry.phase === "error" && "text-destructive")} />
        <span className="w-16 shrink-0 font-semibold">{WS_LABEL[entry.phase]}</span>
        <span className="min-w-0 flex-1 truncate text-muted-foreground">
          {entry.data === undefined ? pathOf(entry.url) : preview(entry.data, 160)}
        </span>
      </>
    );
    body = (
      <>
        <div className="font-mono text-[11px] break-all">{entry.url}</div>
        <Section title="Data" value={entry.data} />
      </>
    );
  } else {
    summary = (
      <>
        <Diamond className="size-3.5 shrink-0 text-primary" />
        <span className="shrink-0 font-semibold">{entry.name}</span>
        <span className="min-w-0 flex-1 truncate text-muted-foreground">{preview(entry.args, 160)}</span>
      </>
    );
    body = <Section title="Emitted arguments" value={entry.args} />;
  }

  return (
    <details className="group border-b last:border-b-0">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-1.5 font-mono text-xs hover:bg-muted/60">
        <span className="w-16 shrink-0 text-[10px] text-muted-foreground">{formatTime(entry.ts)}</span>
        <span className="w-9 shrink-0 text-[10px] text-muted-foreground uppercase">{entry.kind}</span>
        {summary}
      </summary>
      <div className="space-y-2 bg-muted/30 px-3 py-3">{body}</div>
    </details>
  );
}

export function TrafficList({ entries, emptyText }: { entries: TrafficEntry[]; emptyText: string }) {
  if (!entries.length) return <p className="px-3 py-4 text-xs text-muted-foreground">{emptyText}</p>;
  return (
    <div>
      {entries.map((entry) => (
        <Row key={entry.id} entry={entry} />
      ))}
    </div>
  );
}
