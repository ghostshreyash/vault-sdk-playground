import { existsSync } from "node:fs"
import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const here = (p: string) => path.resolve(__dirname, p).replace(/\\/g, "/")
const nm = (p: string) => here(`./node_modules/${p}`)

// The sibling checkout only exists inside the TSP workspace. A standalone clone
// (Vercel, CI) falls back to a stub so the build still succeeds.
const localSdkDir = here("../vault-client-sdk")
const hasLocalSdk =
  !process.env.PLAYGROUND_NO_LOCAL_SDK && existsSync(`${localSdkDir}/src/Vault.js`)

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: "@", replacement: here("./src") },
      // The unpublished SDK source has no node_modules of its own, so its bare
      // imports below must resolve from this project.
      { find: /^vault-sdk-local\//, replacement: `${hasLocalSdk ? localSdkDir : here("./src/stub-sdk")}/` },
      { find: /^axios$/, replacement: nm("axios/dist/esm/axios.js") },
      { find: /^events$/, replacement: nm("events/events.js") },
      { find: /^crypto$/, replacement: nm("crypto-browserify/index.js") },
      { find: /^stream$/, replacement: nm("stream-browserify/index.js") },
      { find: /^ws$/, replacement: here("./src/shims/ws.ts") },
      { find: /^fs$/, replacement: here("./src/shims/fs.ts") },
    ],
  },
  server: {
    fs: { allow: [here("..")] },
  },
  define: {
    "process.env": {},
    global: "window",
    __HAS_LOCAL_SDK__: JSON.stringify(hasLocalSdk),
  },
  optimizeDeps: {
    include: ["events", "crypto-browserify", "stream-browserify", "buffer"],
    exclude: ["vault-sdk-dev", "vault-sdk-staging"],
  },
})
