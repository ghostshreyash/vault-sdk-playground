import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ArgDraft } from "@/sdk/args";
import type { SdkSourceId } from "@/sdk/sources";

export interface EnvConfig {
  VAULT_BASE_URL: string;
  VAULT_WS_URL: string;
  VAULT_ACCESS_KEY: string;
  VAULT_SECRET_KEY: string;
  VAULT_CLIENT_API_KEY: string;
}

export interface EnvVar {
  key: string;
  value: string;
}

export interface Environment {
  id: string;
  name: string;
  source: SdkSourceId;
  config: EnvConfig;
  vars: EnvVar[];
}

export interface SavedRequest {
  id: string;
  name: string;
  method: string;
  args: ArgDraft[];
  script?: string;
  createdAt: number;
}

export interface HistoryEntry {
  id: string;
  ts: number;
  method: string;
  envName: string;
  sdkLabel: string;
  args: ArgDraft[];
  script?: string;
  outcome: "resolved" | "threw";
  summary: string;
  durationMs: number;
}

export const SECRET_FIELDS = ["VAULT_ACCESS_KEY", "VAULT_SECRET_KEY", "VAULT_CLIENT_API_KEY"] as const;

const MAX_HISTORY = 150;

export const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export const newEnvironment = (name = "New environment"): Environment => ({
  id: uid(),
  name,
  source: "dev",
  config: {
    VAULT_BASE_URL: "http://localhost:8000",
    VAULT_WS_URL: "",
    VAULT_ACCESS_KEY: "",
    VAULT_SECRET_KEY: "",
    VAULT_CLIENT_API_KEY: "",
  },
  vars: ["vaultId", "botId", "fileId", "folderId", "sessionId", "priceId"].map((key) => ({ key, value: "" })),
});

export const stripFiles = (drafts: ArgDraft[]): ArgDraft[] =>
  drafts.map((draft) => {
    if (!draft.files) return draft;
    const { files, ...rest } = draft;
    return { ...rest, value: files.map((file) => file.name).join(", ") };
  });

export const varsOf = (env: Environment): Record<string, string> =>
  Object.fromEntries(env.vars.filter((v) => v.key.trim()).map((v) => [v.key.trim(), v.value]));

interface WorkspaceState {
  environments: Environment[];
  activeEnvId: string;
  selected: string;
  drafts: Record<string, ArgDraft[]>;
  script: string;
  saved: SavedRequest[];
  history: HistoryEntry[];

  setActiveEnv: (id: string) => void;
  addEnvironment: (env: Environment) => void;
  updateEnvironment: (id: string, patch: Partial<Environment>) => void;
  removeEnvironment: (id: string) => void;
  setVar: (key: string, value: string) => void;

  select: (method: string) => void;
  setDrafts: (method: string, drafts: ArgDraft[]) => void;
  resetDrafts: (method: string) => void;
  setScript: (script: string) => void;

  saveRequest: (request: Omit<SavedRequest, "id" | "createdAt">) => void;
  removeSaved: (id: string) => void;
  addHistory: (entry: HistoryEntry) => void;
  clearHistory: () => void;
  openEntry: (entry: { method: string; args: ArgDraft[]; script?: string }) => void;

  importWorkspace: (data: { environments?: Environment[]; saved?: SavedRequest[] }) => void;
}

const firstEnv = newEnvironment("Local gateway");

export const useWorkspace = create<WorkspaceState>()(
  persist(
    (set) => ({
      environments: [firstEnv],
      activeEnvId: firstEnv.id,
      selected: "",
      drafts: {},
      script:
        "// `vault` is the live SDK instance, `vars` your environment variables,\n// `last` the value the previous call returned.\nconst files = await vault.getAllFiles(vars.vaultId);\nreturn files;",
      saved: [],
      history: [],

      setActiveEnv: (activeEnvId) => set({ activeEnvId }),
      addEnvironment: (env) => set((s) => ({ environments: [...s.environments, env], activeEnvId: env.id })),
      updateEnvironment: (id, patch) =>
        set((s) => ({ environments: s.environments.map((env) => (env.id === id ? { ...env, ...patch } : env)) })),
      removeEnvironment: (id) =>
        set((s) => {
          const environments = s.environments.filter((env) => env.id !== id);
          if (!environments.length) environments.push(newEnvironment("Local gateway"));
          const activeEnvId = environments.some((env) => env.id === s.activeEnvId)
            ? s.activeEnvId
            : environments[0].id;
          return { environments, activeEnvId };
        }),
      setVar: (key, value) =>
        set((s) => ({
          environments: s.environments.map((env) => {
            if (env.id !== s.activeEnvId) return env;
            const exists = env.vars.some((v) => v.key === key);
            return {
              ...env,
              vars: exists
                ? env.vars.map((v) => (v.key === key ? { ...v, value } : v))
                : [...env.vars, { key, value }],
            };
          }),
        })),

      select: (selected) => set({ selected }),
      setDrafts: (method, drafts) => set((s) => ({ drafts: { ...s.drafts, [method]: drafts } })),
      resetDrafts: (method) =>
        set((s) => {
          const drafts = { ...s.drafts };
          delete drafts[method];
          return { drafts };
        }),
      setScript: (script) => set({ script }),

      saveRequest: (request) =>
        set((s) => ({
          saved: [{ ...request, args: stripFiles(request.args), id: uid(), createdAt: Date.now() }, ...s.saved],
        })),
      removeSaved: (id) => set((s) => ({ saved: s.saved.filter((r) => r.id !== id) })),
      addHistory: (entry) => set((s) => ({ history: [entry, ...s.history].slice(0, MAX_HISTORY) })),
      clearHistory: () => set({ history: [] }),
      openEntry: ({ method, args, script }) =>
        set((s) => ({
          selected: method,
          drafts: { ...s.drafts, [method]: args },
          script: script ?? s.script,
        })),

      importWorkspace: ({ environments = [], saved = [] }) =>
        set((s) => {
          const envById = new Map(s.environments.map((env) => [env.id, env]));
          for (const env of environments) envById.set(env.id, env);
          const savedById = new Map(s.saved.map((r) => [r.id, r]));
          for (const request of saved) savedById.set(request.id, request);
          return { environments: [...envById.values()], saved: [...savedById.values()] };
        }),
    }),
    {
      name: "vault-sdk-playground",
      version: 1,
      partialize: (s) => ({
        environments: s.environments,
        activeEnvId: s.activeEnvId,
        selected: s.selected,
        drafts: Object.fromEntries(Object.entries(s.drafts).map(([k, v]) => [k, stripFiles(v)])),
        script: s.script,
        saved: s.saved,
        history: s.history,
      }),
    }
  )
);

export const selectActiveEnv = (s: WorkspaceState) =>
  s.environments.find((env) => env.id === s.activeEnvId) ?? s.environments[0];

export const useActiveEnv = () => useWorkspace(selectActiveEnv);
