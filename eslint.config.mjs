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
  ]),
  {
    // Disable react-hooks linter for hooks and components that intentionally set state in effects
    files: ["hooks/**/*.ts", "hooks/**/*.tsx", "components/**/*.tsx"],
    rules: {
      "react-hooks/exhaustive-deps": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    // Relax rules for test files
    files: ["__tests__/**/*.ts", "__tests__/**/*.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    // Fixture files and specific component files can use require/any
    files: ["__tests__/fixtures/**/*", "components/DependencyGraph.tsx"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
]);

export default eslintConfig;
