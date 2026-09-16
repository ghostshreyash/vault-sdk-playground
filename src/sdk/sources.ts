export type SdkSourceId = "dev" | "staging" | "prod" | "local";

export interface SdkBundle {
  module: { default: unknown; VaultError?: unknown; ValidationError?: unknown };
  source: string;
  packageJson: string;
}

export interface SdkSource {
  id: SdkSourceId;
  label: string;
  description: string;
  load: () => Promise<SdkBundle>;
}

const bundle = async (
  module: Promise<SdkBundle["module"]>,
  source: Promise<{ default: string }>,
  packageJson: Promise<{ default: string }>
): Promise<SdkBundle> => {
  const [mod, src, pkg] = await Promise.all([module, source, packageJson]);
  return { module: mod, source: src.default, packageJson: pkg.default };
};

const ALL_SOURCES: SdkSource[] = [
  {
    id: "dev",
    label: "vault-sdk-dev (npm)",
    description: "The published dev package installed in this app.",
    load: () =>
      bundle(
        import("vault-sdk-dev"),
        import("vault-sdk-dev/src/Vault.js?raw"),
        import("vault-sdk-dev/package.json?raw")
      ),
  },
  {
    id: "staging",
    label: "vault-sdk-staging (npm)",
    description: "The published staging package installed in this app.",
    load: () =>
      bundle(
        import("vault-sdk-staging"),
        import("vault-sdk-staging/src/Vault.js?raw"),
        import("vault-sdk-staging/package.json?raw")
      ),
  },
  {
    id: "prod",
    label: "vault-sdk-prod (npm)",
    description: "The published production package installed in this app.",
    load: () =>
      bundle(
        import("vault-sdk-prod"),
        import("vault-sdk-prod/src/Vault.js?raw"),
        import("vault-sdk-prod/package.json?raw")
      ),
  },
  {
    id: "local",
    label: "Local source (SDK/vault-client-sdk)",
    description: "Unpublished code from the sibling repo, whatever branch it has checked out.",
    load: () =>
      bundle(
        import("vault-sdk-local/index.js"),
        import("vault-sdk-local/src/Vault.js?raw"),
        import("vault-sdk-local/package.json?raw")
      ),
  },
];

// The local checkout only exists inside the TSP workspace; elsewhere it is hidden
// rather than offered and then failing on load.
export const SDK_SOURCES: SdkSource[] = ALL_SOURCES.filter(
  (source) => source.id !== "local" || __HAS_LOCAL_SDK__
);

export const sourceById = (id: SdkSourceId) => SDK_SOURCES.find((s) => s.id === id) ?? SDK_SOURCES[0];
