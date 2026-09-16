import { useMemo, useState } from "react";
import { Bookmark, History, ListTree, Search, SquareTerminal, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LoadedSdk } from "@/sdk/loader";
import { INHERITED_GROUP } from "@/sdk/catalog";
import { SCRIPT_METHOD } from "@/sdk/args";
import { useSession } from "@/store/session";
import { useWorkspace } from "@/store/workspace";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatMs, formatTime } from "@/lib/format";
import { StatusDot } from "@/components/common";

type Tab = "methods" | "saved" | "history";

export function Sidebar({ sdk }: { sdk: LoadedSdk }) {
  const [tab, setTab] = useState<Tab>("methods");
  const savedCount = useWorkspace((s) => s.saved.length);
  const historyCount = useWorkspace((s) => s.history.length);

  const tabs: { id: Tab; label: string; icon: typeof ListTree; count?: number }[] = [
    { id: "methods", label: "Methods", icon: ListTree, count: sdk.methods.length },
    { id: "saved", label: "Saved", icon: Bookmark, count: savedCount },
    { id: "history", label: "History", icon: History, count: historyCount },
  ];

  return (
    <aside className="flex w-76 shrink-0 flex-col border-r bg-sidebar">
      <div className="grid grid-cols-3 border-b">
        {tabs.map(({ id, label, icon: Icon, count }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "flex items-center justify-center gap-1.5 border-b-2 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground",
              tab === id ? "border-primary text-foreground" : "border-transparent"
            )}
          >
            <Icon className="size-3.5" />
            {label}
            <span className="rounded bg-muted px-1 text-[10px]">{count}</span>
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "methods" && <MethodList sdk={sdk} />}
        {tab === "saved" && <SavedList />}
        {tab === "history" && <HistoryList />}
      </div>
    </aside>
  );
}

function MethodList({ sdk }: { sdk: LoadedSdk }) {
  const [query, setQuery] = useState("");
  const selected = useWorkspace((s) => s.selected);
  const select = useWorkspace((s) => s.select);
  const results = useSession((s) => s.results);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const map = new Map<string, LoadedSdk["methods"]>();
    for (const method of sdk.methods) {
      if (q && !method.name.toLowerCase().includes(q) && !method.summary.toLowerCase().includes(q)) continue;
      map.set(method.group, [...(map.get(method.group) ?? []), method]);
    }
    return [...map.entries()];
  }, [sdk.methods, query]);

  return (
    <div className="p-2">
      <div className="relative mb-2">
        <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter methods"
          className="h-8 pl-8 text-xs"
        />
      </div>

      <button
        type="button"
        onClick={() => select(SCRIPT_METHOD)}
        className={cn(
          "mb-2 flex w-full items-center gap-2 rounded-md border border-dashed px-2.5 py-2 text-left text-xs hover:bg-accent",
          selected === SCRIPT_METHOD && "border-primary bg-accent"
        )}
      >
        <SquareTerminal className="size-4 text-primary" />
        <span className="flex-1">
          <span className="block font-medium">Script</span>
          <span className="text-muted-foreground">Free-form JS against the live instance</span>
        </span>
        <StatusDot outcome={results[SCRIPT_METHOD]?.outcome} />
      </button>

      {groups.map(([group, methods]) => (
        <details key={group} open={Boolean(query) || group !== INHERITED_GROUP} className="mb-1">
          <summary className="cursor-pointer px-1.5 py-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase select-none">
            {group} <span className="font-normal">({methods.length})</span>
          </summary>
          {methods.map((method) => (
            <button
              key={method.name}
              type="button"
              onClick={() => select(method.name)}
              title={method.summary || method.name}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent",
                selected === method.name && "bg-accent text-accent-foreground"
              )}
            >
              <span className={cn("truncate font-mono text-xs", method.internal && "text-muted-foreground")}>
                {method.name}
              </span>
              <span className="ml-auto flex items-center gap-1">
                {method.internal && <Tag>internal</Tag>}
                {!method.isAsync && <Tag>sync</Tag>}
                <StatusDot outcome={results[method.name]?.outcome} />
              </span>
            </button>
          ))}
        </details>
      ))}
      {!groups.length && <p className="p-4 text-center text-xs text-muted-foreground">No method matches.</p>}
    </div>
  );
}

const Tag = ({ children }: { children: string }) => (
  <span className="rounded border px-1 text-[9px] leading-4 text-muted-foreground uppercase">{children}</span>
);

const displayName = (method: string) => (method === SCRIPT_METHOD ? "Script" : method);

function SavedList() {
  const saved = useWorkspace((s) => s.saved);
  const openEntry = useWorkspace((s) => s.openEntry);
  const removeSaved = useWorkspace((s) => s.removeSaved);

  if (!saved.length) {
    return (
      <p className="p-6 text-center text-xs text-muted-foreground">
        Nothing saved yet. Use <b>Save</b> on a request to keep its arguments here.
      </p>
    );
  }

  return (
    <ul className="p-2">
      {saved.map((request) => (
        <li key={request.id} className="group flex items-center rounded-md hover:bg-accent">
          <button type="button" onClick={() => openEntry(request)} className="min-w-0 flex-1 px-2 py-1.5 text-left">
            <span className="block truncate text-xs font-medium">{request.name}</span>
            <span className="block truncate font-mono text-[11px] text-muted-foreground">
              {displayName(request.method)}
            </span>
          </button>
          <Button
            variant="ghost"
            size="icon-xs"
            className="mr-1 opacity-0 group-hover:opacity-100"
            onClick={() => removeSaved(request.id)}
            aria-label={`Delete ${request.name}`}
          >
            <Trash2 />
          </Button>
        </li>
      ))}
    </ul>
  );
}

function HistoryList() {
  const history = useWorkspace((s) => s.history);
  const openEntry = useWorkspace((s) => s.openEntry);
  const clearHistory = useWorkspace((s) => s.clearHistory);

  if (!history.length) {
    return <p className="p-6 text-center text-xs text-muted-foreground">Every call you send is recorded here.</p>;
  }

  return (
    <div className="p-2">
      <div className="mb-1 flex justify-end">
        <Button variant="ghost" size="xs" onClick={clearHistory}>
          <Trash2 /> Clear
        </Button>
      </div>
      <ul>
        {history.map((entry) => (
          <li key={entry.id}>
            <button
              type="button"
              onClick={() => openEntry(entry)}
              className="w-full rounded-md px-2 py-1.5 text-left hover:bg-accent"
              title={entry.summary}
            >
              <span className="flex items-center gap-2">
                <StatusDot outcome={entry.outcome} />
                <span className="truncate font-mono text-xs">{displayName(entry.method)}</span>
                <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{formatMs(entry.durationMs)}</span>
              </span>
              <span className="block truncate pl-4 text-[11px] text-muted-foreground">
                {formatTime(entry.ts)} · {entry.envName} · {entry.summary}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
