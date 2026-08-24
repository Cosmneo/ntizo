import { configDefaults, defineConfig } from "vitest/config";

/**
 * The kit ships components, not an app — there is no dev server or build
 * here, so this is a `vitest.config.ts` rather than the `vite.config.ts` the
 * web app has. The `test` block mirrors that app's exactly: jsdom for the DOM
 * the component tests assert against, and a setup file that wires up
 * `jest-dom`'s matchers before any test runs.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    // `image-cropper.test.ts` predates this config and runs on Bun's own
    // test runner (`bun:test` imports, no DOM needed) rather than Vitest.
    // Vitest can't resolve `bun:test`, so it is excluded here rather than
    // left to fail on a file this config was never meant to run.
    exclude: [...configDefaults.exclude, "src/components/__tests__/image-cropper.test.ts"],
  },
});
