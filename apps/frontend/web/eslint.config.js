import { config as reactInternalConfig } from "@ntizo/eslint-config/react-internal.js";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...reactInternalConfig,
  {
    ignores: ["dist/**", "node_modules/**", "src/routeTree.gen.ts"],
  },
];
