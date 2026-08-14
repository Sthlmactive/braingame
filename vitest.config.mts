import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  // next.js sets jsx: "preserve" in tsconfig for its own compiler, which would
  // leave JSX untransformed here. The design tests render components, so they
  // need it compiled.
  oxc: { jsx: { runtime: "automatic" } },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", "out/**", ".next/**"],
  },
});
