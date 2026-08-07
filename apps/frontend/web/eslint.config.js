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
        {
          type: "viewmodel",
          pattern: ["src/features/*/viewmodel/**", "src/features/*/hooks/**"],
        },
        {
          type: "ui",
          pattern: [
            "src/features/*/ui/**",
            "src/shared/ui/**",
            "src/shared/components/**",
            "src/features/*/components/**",
            "src/features/*/pages/**",
            // features/admin/** nests one level deeper than the other
            // features (e.g. admin/users/users-page.tsx,
            // admin/dashboard/pages/...), so the single-segment `*` above
            // never matches it and it was left ungoverned. Mapping the
            // whole admin tree to `ui` brings it under the boundaries
            // policy; a hook misclassified as `ui` can still reach
            // everything it needs, and the only thing this newly forbids
            // is `ui -> data`, which is exactly what should be forbidden.
            "src/features/admin/**",
          ],
        },
        { type: "routes", pattern: ["src/routes/**"] },
        { type: "shared", pattern: ["src/shared/**"] },
      ],
      // Legitimate non-element roots: entry points, root-level config, and
      // the worker shim, none of which belong under any `src/features/*`
      // layer. Anything NOT listed here now fails `boundaries/no-unknown-files`
      // instead of silently laundering a layered import through an
      // unclassified folder (see the F1 finding this rule closes).
      "boundaries/ignore": [
        "src/main.tsx",
        "src/router.tsx",
        "src/lib/query-client.ts",
        "src/test/**",
        "vite.config.ts",
        "eslint.config.js",
        "worker/**",
      ],
    },
    rules: {
      "boundaries/no-unknown-files": "error",
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
