import { defineConfig } from "@solidjs/start/config";

export default defineConfig({
  server: {
    preset: "cloudflare_module",
    compatibilityDate: "2025-10-11",
    rollupConfig: {
      external: ["node:async_hooks"]
    }
  }
});