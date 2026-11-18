import { defineConfig } from "vitest/config"
import path from "path"

export default defineConfig({
  test: {
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // Packages from source, so tests need no build of packages/.
      "nonoha-client-js": path.resolve(__dirname, "packages/nonoha-client-js/src/index.ts"),
      "nonoha-views": path.resolve(__dirname, "packages/nonoha-views/src/index.ts"),
    },
  },
})
