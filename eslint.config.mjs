import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Ignore Node.js scripts (they use require() which is valid in Node.js)
    "scripts/**",
    // Standalone packages with their own toolchain (e.g. the Seymour MCP server)
    "tools/**",
    "public/debug-auth.js",
  ]),
]);

export default eslintConfig;
