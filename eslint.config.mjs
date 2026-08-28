import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";
import globals from "globals";
import tseslint from "typescript-eslint";

// eslint-config-next still ships eslintrc-style configs; FlatCompat bridges
// them into this flat config, scoped to the web app only.
const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      ".worktrees/**",
      ".data/**",
      "**/next-env.d.ts",
      // Downloaded skill packages (skill-manager cache), not repo source -
      // see .gitignore.
      ".agents/**",
      ".claude/skills/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...compat.extends("next/core-web-vitals").map((config) => ({
    ...config,
    files: ["apps/web/**/*.{ts,tsx}"],
    settings: { ...config.settings, next: { rootDir: "apps/web/" } },
  })),
  {
    // Plain Node scripts (no TypeScript, no bundler) - give them the Node
    // globals the recommended config doesn't assume.
    files: ["scripts/**/*.mjs"],
    languageOptions: { globals: globals.node },
  },
  {
    rules: {
      // Strict TypeScript is the project rule (CLAUDE.md section 3): no any,
      // and unused code doesn't get committed.
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // Deliberately plain <img>: every image here is a screenshot served
      // from the content-addressed immutable shots route. next/image would
      // re-encode and resize them - the one thing a visual regression tool
      // must never do to the pixels it's asking a human to judge.
      "@next/next/no-img-element": "off",
    },
  },
);
