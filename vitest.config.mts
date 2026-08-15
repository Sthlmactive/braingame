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
    // .tsx too: the clock test mounts a component, because a render-phase
    // update is a React lifecycle bug that no pure test can see.
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: ["node_modules/**", "out/**", ".next/**"],
  },
});
