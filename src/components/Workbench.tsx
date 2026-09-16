import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { LoadedSdk } from "@/sdk/loader";
import { RequestPanel } from "@/components/RequestPanel";
import { ResponsePanel } from "@/components/ResponsePanel";

export function Workbench({ sdk }: { sdk: LoadedSdk }) {
  const [ratio, setRatio] = useState(0.5);
  const container = useRef<HTMLDivElement>(null);

  const startDrag = (event: ReactPointerEvent) => {
    event.preventDefault();
    const rect = container.current?.getBoundingClientRect();
    if (!rect) return;
    const move = (e: PointerEvent) =>
      setRatio(Math.min(0.85, Math.max(0.15, (e.clientY - rect.top) / rect.height)));
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  };

  return (
    <div ref={container} className="flex min-h-0 min-w-0 flex-1 flex-col">
      <section style={{ height: `${ratio * 100}%` }} className="min-h-0 overflow-auto">
        <RequestPanel sdk={sdk} />
      </section>
      <div
        role="separator"
        aria-orientation="horizontal"
        onPointerDown={startDrag}
        className="h-1.5 shrink-0 cursor-row-resize border-y bg-muted hover:bg-primary/30"
      />
      <section className="min-h-0 flex-1 overflow-auto bg-background">
        <ResponsePanel />
      </section>
    </div>
  );
}
