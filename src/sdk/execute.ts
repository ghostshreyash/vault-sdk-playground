import { toast } from "sonner";
import { createDrafts, evaluate, resolveArgs, SCRIPT_METHOD } from "./args";
import { useSdkStore } from "./loader";
import { getVault, type VaultInstance } from "./runtime";
import { preview } from "./serialize";
import { markRunning, storeResult, useSession, type RunPhase, type RunRecord } from "@/store/session";
import { selectActiveEnv, stripFiles, uid, useWorkspace, varsOf } from "@/store/workspace";

export async function runSelected() {
  const workspace = useWorkspace.getState();
  const method = workspace.selected;
  if (!method) return;

  const env = selectActiveEnv(workspace);
  const sdkState = useSdkStore.getState().byId[env.source];
  if (sdkState?.status !== "ready") {
    toast.error("The selected SDK has not loaded yet.");
    return;
  }
  const { sdk } = sdkState;
  const vars = varsOf(env);
  const info = sdk.methods.find((m) => m.name === method);
  if (method !== SCRIPT_METHOD && !info) {
    toast.error(`${sdk.label} has no method named "${method}".`);
    return;
  }

  const drafts = method === SCRIPT_METHOD ? [] : workspace.drafts[method] ?? createDrafts(info!, vars);
  const script = workspace.script;
  const startedAt = Date.now();
  let started = performance.now();
  let args: unknown[] = [];

  markRunning(method, 1);

  const finish = (outcome: RunRecord["outcome"], phase: RunPhase, result: { value?: unknown; error?: unknown }) => {
    const record: RunRecord = {
      id: uid(),
      method,
      envName: env.name,
      sdkLabel: sdk.label,
      startedAt,
      endedAt: Date.now(),
      durationMs: performance.now() - started,
      outcome,
      phase,
      args,
      ...result,
    };
    storeResult(record);
    markRunning(method, -1);
    useWorkspace.getState().addHistory({
      id: record.id,
      ts: startedAt,
      method,
      envName: env.name,
      sdkLabel: sdk.label,
      args: stripFiles(drafts),
      script: method === SCRIPT_METHOD ? script : undefined,
      outcome,
      summary:
        outcome === "resolved"
          ? preview(result.value, 90)
          : String((result.error as Error | undefined)?.message ?? result.error),
      durationMs: record.durationMs,
    });
  };

  let vault: VaultInstance;
  try {
    vault = getVault(sdk, env.config);
  } catch (error) {
    finish("threw", "constructor", { error });
    return;
  }

  const scope = { vault, vars, last: useSession.getState().last };

  try {
    args = method === SCRIPT_METHOD ? [] : await resolveArgs(drafts, scope);
  } catch (error) {
    finish("threw", "arguments", { error });
    return;
  }

  started = performance.now();
  try {
    const value =
      method === SCRIPT_METHOD
        ? await evaluate(script, scope)
        : await (vault[method] as (...a: unknown[]) => unknown).apply(vault, args);
    finish("resolved", "call", { value });
  } catch (error) {
    finish("threw", "call", { error });
  }
}
