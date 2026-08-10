import { config } from "@ntizo/eslint-config/base.js";

/** @type {import("eslint").Linter.Config[]} */
// `.wrangler/` holds the bundles `wrangler dev` writes on every start. They
// are gitignored but were still being linted, so anyone who had run the dev
// server locally saw the lint gate fail with tens of thousands of errors in
// generated code — and on a clean checkout it passed. Same reason as dist/.
export default [
  ...config,
  { ignores: ["dist/**", "node_modules/**", ".wrangler/**"] },
];
