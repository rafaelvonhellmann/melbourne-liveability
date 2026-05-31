import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

// `eslint .` (our lint script) does not apply Next's built-in ignores, so skip
// build output explicitly — otherwise generated bundles in .next/ and out/ trip
// rules like no-assign-module-variable.
const config = [
  { ignores: [".next/**", "out/**"] },
  ...compat.extends("next/core-web-vitals"),
];

export default config;
