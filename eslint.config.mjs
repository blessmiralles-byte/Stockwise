import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// `npm run build` runs `npm run lint` first: errors fail the build, warnings don't.
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // ~730 existing uses, mostly API payloads. Kept visible as warnings so new
      // code can be typed properly without blocking every build on the old code.
      "@typescript-eslint/no-explicit-any": "warn",
      // Apostrophes and quotes in JSX text render fine; only flag the characters
      // that usually mean a typo in the markup.
      "react/no-unescaped-entities": ["error", { forbid: [">", "}"] }],
    },
  },
  {
    // Plain Node scripts (CommonJS), run with `node scripts/x.js`.
    files: ["scripts/**/*.js"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
