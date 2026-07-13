import path from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      // Real mapbox-gl (~1.6MB) OOMs vitest workers during transform.
      // Keep these BEFORE the `@` alias so they win resolution.
      {
        find: /^mapbox-gl$/,
        replacement: path.resolve(__dirname, "./src/test/mapbox-gl-stub.ts"),
      },
      {
        find: /^mapbox-gl\/dist\/mapbox-gl\.css$/,
        replacement: path.resolve(__dirname, "./src/test/empty-module.ts"),
      },
      {
        find: path.resolve(__dirname, "./src/components/LocationMapSave.tsx"),
        replacement: path.resolve(__dirname, "./src/test/empty-module.ts"),
      },
      { find: "@", replacement: path.resolve(__dirname, "./src") },
    ],
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
