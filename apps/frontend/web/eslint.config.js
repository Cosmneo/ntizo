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
        {
          type: "domain",
          pattern: [
            "src/features/*/domain/**",
            // provider/services, provider/availability and directory/services
            // all nest one level deeper than the other features
            // (provider/services/domain, not provider/domain), so the
            // single-segment `*` above never matches any of them. Named
            // explicitly rather than lumped into `ui` the way admin's is
            // below: the whole point of this feature's layers is that `ui`
            // cannot reach `data` directly, which the admin blanket rule
            // would silently defeat.
            "src/features/provider/services/domain/**",
            "src/features/provider/availability/domain/**",
            "src/features/directory/services/domain/**",
            "src/shared/domain/**",
          ],
        },
        {
          type: "data",
          pattern: [
            "src/features/*/data/**",
            "src/features/provider/services/data/**",
            "src/features/provider/availability/data/**",
            "src/features/directory/services/data/**",
          ],
        },
        {
          type: "viewmodel",
          pattern: [
            "src/features/*/viewmodel/**",
            "src/features/provider/services/viewmodel/**",
            "src/features/provider/availability/viewmodel/**",
            "src/features/directory/services/viewmodel/**",
          ],
        },
        {
          type: "ui",
          pattern: [
            "src/features/*/ui/**",
            "src/features/provider/services/ui/**",
            "src/features/provider/availability/ui/**",
            "src/features/directory/services/ui/**",
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
      // Legitimate non-element roots: entry points and root-level config,
      // none of which belong under any `src/features/*` layer. Anything
      // NOT listed here now fails `boundaries/no-unknown-files`
      // instead of silently laundering a layered import through an
      // unclassified folder (see the F1 finding this rule closes).
      "boundaries/ignore": [
        "src/main.tsx",
        "src/router.tsx",
        "src/start.ts",
        "src/lib/query-client.ts",
        "src/test/**",
        "vite.config.ts",
        "eslint.config.js",
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
