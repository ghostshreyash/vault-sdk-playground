// Stands in for the sibling SDK/vault-client-sdk checkout when it is not on disk,
// so a standalone clone (Vercel, a fresh machine) still builds. The Local source
// option is hidden in that case — see __HAS_LOCAL_SDK__ in vite.config.ts.
export default class VaultLocalUnavailable {
  constructor() {
    throw new Error(
      "[Playground] The local SDK checkout (SDK/vault-client-sdk) is not available in this deployment. " +
        "Pick a published SDK source instead."
    );
  }
}
