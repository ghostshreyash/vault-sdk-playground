declare const __HAS_LOCAL_SDK__: boolean;

declare module "vault-sdk-dev";
declare module "vault-sdk-prod";
declare module "vault-sdk-staging";
declare module "vault-sdk-local/index.js";

interface Window {
  Buffer: unknown;
  process: unknown;
}
