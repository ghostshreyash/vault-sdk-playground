import { useEffect } from "react";
import { ThemeProvider } from "@/lib/theme";
import { Loader2 } from "lucide-react";
import { loadSdk, useSdk } from "@/sdk/loader";
import { runSelected } from "@/sdk/execute";
import { sourceById } from "@/sdk/sources";
import { useActiveEnv } from "@/store/workspace";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { EmptyState } from "@/components/common";
import { EventsDock } from "@/components/EventsDock";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { Workbench } from "@/components/Workbench";

export default function App() {
  const env = useActiveEnv();
  const sdkState = useSdk(env.source);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        void runSelected();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <ThemeProvider>
    <div className="flex h-full flex-col">
      <TopBar sdkState={sdkState} />
      {sdkState.status === "ready" ? (
        <div className="flex min-h-0 flex-1">
          <Sidebar sdk={sdkState.sdk} />
          <Workbench sdk={sdkState.sdk} />
        </div>
      ) : (
        <div className="min-h-0 flex-1">
          <EmptyState>
            {sdkState.status === "loading" ? (
              <span className="flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" /> Loading {sourceById(env.source).label}…
              </span>
            ) : (
              <div className="space-y-3">
                <p>
                  Could not load <b>{sourceById(env.source).label}</b>:{" "}
                  <code className="font-mono text-destructive">{String((sdkState.error as Error)?.message ?? sdkState.error)}</code>
                </p>
                <Button variant="outline" size="sm" onClick={() => loadSdk(env.source, true)}>
                  Retry
                </Button>
              </div>
            )}
          </EmptyState>
        </div>
      )}
      <EventsDock />
      <Toaster position="bottom-right" />
    </div>
    </ThemeProvider>
  );
}
