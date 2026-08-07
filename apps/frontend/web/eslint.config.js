import { config as reactInternalConfig } from "@ntizo/eslint-config/react-internal.js";
import boundaries from "eslint-plugin-boundaries";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...reactInternalConfig,
  {
    ignores: ["dist/**", "node_modules/**", "src/routeTree.gen.ts"],
  },
  {
    plugins: { boundaries },
    settings: {
      "import/resolver": {
        typescript: {
          project: "./tsconfig.json",
        },
      },
      "boundaries/elements": [
        { type: "domain", pattern: ["src/features/*/domain/**", "src/shared/domain/**"] },
        { type: "data", pattern: ["src/features/*/data/**"] },
        { type: "viewmodel", pattern: ["src/features/*/viewmodel/**"] },
        {
          type: "ui",
          pattern: ["src/features/*/ui/**", "src/shared/ui/**", "src/shared/components/**"],
        },
        { type: "routes", pattern: ["src/routes/**"] },
        { type: "shared", pattern: ["src/shared/**"] },
      ],
    },
    rules: {
      "boundaries/dependencies": [
        "error",
        {
          default: "disallow",
          policies: [
            {
              from: { element: { type: "domain" } },
              allow: [{ to: { element: { type: "domain" } } }],
            },
            {
              from: { element: { type: "data" } },
              allow: [
                { to: { element: { type: "domain" } } },
                { to: { element: { type: "data" } } },
                { to: { element: { type: "shared" } } },
              ],
            },
            {
              from: { element: { type: "viewmodel" } },
              allow: [
                { to: { element: { type: "domain" } } },
                { to: { element: { type: "data" } } },
                { to: { element: { type: "viewmodel" } } },
                { to: { element: { type: "shared" } } },
              ],
            },
            {
              from: { element: { type: "ui" } },
              allow: [
                { to: { element: { type: "domain" } } },
                { to: { element: { type: "viewmodel" } } },
                { to: { element: { type: "ui" } } },
                { to: { element: { type: "shared" } } },
              ],
            },
            {
              from: { element: { type: "routes" } },
              allow: [
                { to: { element: { type: "domain" } } },
                { to: { element: { type: "viewmodel" } } },
                { to: { element: { type: "ui" } } },
                { to: { element: { type: "routes" } } },
                { to: { element: { type: "shared" } } },
              ],
            },
            {
              from: { element: { type: "shared" } },
              allow: [
                { to: { element: { type: "domain" } } },
                { to: { element: { type: "shared" } } },
              ],
            },
          ],
        },
      ],
    },
  },
];
