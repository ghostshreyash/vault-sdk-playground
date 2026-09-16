import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Radio, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { clearTraffic, useTraffic, type TrafficEntry } from "@/sdk/traffic";
import { Button } from "@/components/ui/button";
import { TrafficList } from "@/components/TrafficList";

type Filter = "all" | TrafficEntry["kind"];

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "http", label: "HTTP" },
  { id: "ws", label: "WebSocket" },
  { id: "event", label: "SDK events" },
];

export function EventsDock() {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const entries = useTraffic((s) => s.entries);

  const visible = useMemo(
    () => entries.filter((entry) => filter === "all" || entry.kind === filter).slice().reverse(),
    [entries, filter]
  );

  return (
    <section className="shrink-0 border-t bg-card">
      <div className="flex h-9 items-center gap-2 px-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 text-xs font-medium"
        >
          <Radio className="size-3.5 text-primary" />
          Live traffic
          <span className="rounded bg-muted px-1.5 text-[10px]">{entries.length}</span>
          {open ? <ChevronDown className="size-3.5" /> : <ChevronUp className="size-3.5" />}
        </button>
        {open && (
          <>
            <div className="ml-3 flex gap-1">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id)}
                  className={cn(
                    "rounded px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent",
                    filter === f.id && "bg-accent text-foreground"
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <Button variant="ghost" size="xs" className="ml-auto" onClick={clearTraffic}>
              <Trash2 /> Clear
            </Button>
          </>
        )}
      </div>
      {open && (
        <div className="h-64 overflow-y-auto border-t">
          <TrafficList
            entries={visible}
            emptyText="Everything the SDK sends or receives lands here, including socket messages that arrive after a call returns."
          />
        </div>
      )}
    </section>
  );
}
