import { config } from "@ntizo/eslint-config/base.js";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...config,
  { ignores: ["dist/**", "node_modules/**", "playwright-report/**", "test-results/**"] },
];
