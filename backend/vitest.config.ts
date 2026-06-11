import { defineConfig } from "vitest/config";

// Backend tests are pure node units: the router and helpers only need the
// WHATWG Request/Response/crypto globals that node 20+ ships via undici -
// no workers runtime, no miniflare. Run from backend/ (resolves vitest from
// the repo root node_modules):
//   node ../node_modules/vitest/vitest.mjs run
// or from the repo root:
//   node node_modules/vitest/vitest.mjs run -c backend/vitest.config.ts
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});
