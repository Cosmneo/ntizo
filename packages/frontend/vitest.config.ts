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
    /*
     * Vitest stubs every CSS import to an empty string by default, and its
     * check is on the extension — so `globals.css?raw` is stubbed too, and a
     * test that reads the stylesheet to assert on it silently compares
     * nothing. Enabling this lets Vite's own `?raw` handling win.
     *
     * Nothing else in this package imports CSS, so this turns on a pipeline
     * for exactly one file: `styles/__tests__/tokens.test.ts`.
     */
    css: true,
  },
});
