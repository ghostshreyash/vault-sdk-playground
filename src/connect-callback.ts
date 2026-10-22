import type { Environment } from "@/store/workspace";

// The Vault Connect popup returns here. handleRedirect() posts the result to the playground
// window that opened it, which finishes connect(); the SDK instance there does the token exchange.
const loaders = {
  "connect-dev": () => import("vault-connect-dev/browser"),
  "connect-staging": () => import("vault-connect-staging/browser"),
};

const show = (text: string) => {
  document.getElementById("msg")!.textContent = text;
};

async function finish() {
  const saved = JSON.parse(localStorage.getItem("vault-sdk-playground") ?? "{}") as {
    state?: { environments?: Environment[]; activeEnvId?: string };
  };
  const envs = saved.state?.environments ?? [];
  const env = envs.find((e) => e.id === saved.state?.activeEnvId) ?? envs[0];
  const load = env && loaders[env.source as keyof typeof loaders];
  if (!load) {
    show("The active playground environment is not a Vault Connect one. Close this window and try again.");
    return;
  }

  const { VaultConnectBrowser } = await load();
  const vault = new VaultConnectBrowser({
    clientId: env.config.VC_CLIENT_ID ?? "",
    redirectUri: env.config.VC_REDIRECT_URI || window.location.href.split("?")[0],
    ...(env.config.VC_API_URL && { apiUrl: env.config.VC_API_URL }),
    ...(env.config.VC_APP_URL && { appUrl: env.config.VC_APP_URL }),
  });
  const tokens = await vault.handleRedirect();
  if (tokens) show("Connected. You can close this window and go back to the playground.");
}

finish().catch((error: unknown) => show(`${(error as Error).message} You can close this window.`));
