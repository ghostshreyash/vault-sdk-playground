import { useEffect } from "react";
import { create } from "zustand";
import { buildCatalog, buildCatalogFromDts, type MethodInfo } from "./catalog";
import { familyOf, sourceById, type SdkFamily, type SdkSourceId } from "./sources";

export interface LoadedSdk {
  sourceId: SdkSourceId;
  family: SdkFamily;
  Vault: new (config: unknown) => unknown;
  packageName: string;
  version: string;
  label: string;
  methods: MethodInfo[];
}

export type SdkLoadState =
  | { status: "loading" }
  | { status: "error"; error: unknown }
  | { status: "ready"; sdk: LoadedSdk };

export const useSdkStore = create<{ byId: Partial<Record<SdkSourceId, SdkLoadState>> }>()(() => ({
  byId: {},
}));

const setState = (id: SdkSourceId, state: SdkLoadState) =>
  useSdkStore.setState((s) => ({ byId: { ...s.byId, [id]: state } }));

export function loadSdk(id: SdkSourceId, force = false) {
  const current = useSdkStore.getState().byId[id];
  if (current && current.status !== "error" && !force) return;
  setState(id, { status: "loading" });

  sourceById(id)
    .load()
    .then(({ module, source, packageJson }) => {
      const Vault = module.default as LoadedSdk["Vault"];
      const pkg = JSON.parse(packageJson) as { name?: string; version?: string };
      const packageName = pkg.name ?? id;
      const version = pkg.version ?? "?";
      const family = familyOf(id);
      const SdkClass = Vault as unknown as { prototype: object };
      setState(id, {
        status: "ready",
        sdk: {
          sourceId: id,
          family,
          Vault,
          packageName,
          version,
          label: `${packageName}@${version}${id === "local" ? " (local)" : ""}`,
          methods:
            family === "connect"
              ? buildCatalogFromDts(source, SdkClass, "VaultConnectBrowser")
              : buildCatalog(source, SdkClass),
        },
      });
    })
    .catch((error: unknown) => setState(id, { status: "error", error }));
}

export function useSdk(id: SdkSourceId): SdkLoadState {
  useEffect(() => loadSdk(id), [id]);
  return useSdkStore((s) => s.byId[id]) ?? { status: "loading" };
}
