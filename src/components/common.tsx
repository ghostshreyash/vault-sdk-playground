import { useMemo, type ComponentProps, type ReactNode } from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { stringify } from "@/sdk/serialize";
import { Button } from "@/components/ui/button";

export function NativeSelect({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-8 rounded-md border border-input bg-background px-2 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function CopyButton({ text, className, label = "Copy" }: { text: string; className?: string; label?: string }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="xs"
      className={className}
      onClick={() =>
        navigator.clipboard
          .writeText(text)
          .then(() => toast.success("Copied to clipboard"))
          .catch(() => toast.error("Clipboard is not available"))
      }
    >
      <Copy /> {label}
    </Button>
  );
}

const TOKEN = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
const HIGHLIGHT_LIMIT = 150_000;

function highlight(text: string): ReactNode[] {
  if (text.length > HIGHLIGHT_LIMIT) return [text];
  const out: ReactNode[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(TOKEN)) {
    const index = match.index ?? 0;
    if (index > lastIndex) out.push(text.slice(lastIndex, index));
    const [whole, str, colon, literal, num] = match;
    const cls = str ? (colon ? "json-key" : "json-string") : literal ? "json-literal" : num ? "json-number" : "";
    out.push(
      <span key={index} className={cls}>
        {str ?? whole}
      </span>
    );
    if (colon) out.push(colon);
    lastIndex = index + whole.length;
  }
  out.push(text.slice(lastIndex));
  return out;
}

export function CodeBlock({ text, className }: { text: string; className?: string }) {
  const nodes = useMemo(() => highlight(text), [text]);
  return (
    <div className={cn("relative", className)}>
      <CopyButton text={text} className="absolute top-2 right-2 bg-card/90" />
      <pre className="overflow-auto rounded-md border bg-card p-3 pr-20 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all">
        {nodes}
      </pre>
    </div>
  );
}

export function JsonView({ value, className }: { value: unknown; className?: string }) {
  const text = useMemo(() => stringify(value), [value]);
  return <CodeBlock text={text} className={className} />;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
      <div className="max-w-sm">{children}</div>
    </div>
  );
}

export function StatusDot({ outcome }: { outcome?: "resolved" | "threw" }) {
  if (!outcome) return null;
  return (
    <span
      className={cn("inline-block size-2 shrink-0 rounded-full", outcome === "resolved" ? "bg-success" : "bg-destructive")}
      title={outcome === "resolved" ? "Last call resolved" : "Last call threw"}
    />
  );
}
