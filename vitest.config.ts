import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Component tests are .test.tsx; transform their JSX with the automatic
  // runtime (tsconfig says "preserve", which is for Next's compiler only).
  esbuild: { jsx: "automatic" },
  test: {
    // Default stays node (fast). Component tests opt into jsdom per file via
    // a leading `// @vitest-environment jsdom` comment.
    include: ["**/*.test.ts", "**/*.test.tsx"],
    environment: "node",
    // jsdom component files pay a multi-second cold-mount (env spin-up +
    // module graph) under full-suite parallel load on this machine; 5s
    // default flakes on whichever file mounts first. Healthy tests are
    // unaffected; only genuine hangs report slower.
    testTimeout: 20000,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
