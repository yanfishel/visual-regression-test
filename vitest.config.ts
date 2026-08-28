import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // apps/web/e2e is a Playwright suite - its *.spec.ts files match
    // vitest's default include pattern but must never run under vitest
    // (Playwright's test() throws when called outside its own runner).
    // .worktrees holds sibling checkouts (local only) - same ignore as the
    // eslint config.
    exclude: [...configDefaults.exclude, "**/e2e/**", ".worktrees/**"],
  },
});
