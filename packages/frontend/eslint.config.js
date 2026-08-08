import { config } from "@ntizo/eslint-config/react-internal.js";

/** @type {import("eslint").Linter.Config[]} */
export default [...config, { ignores: ["dist/**", "node_modules/**"] }];
