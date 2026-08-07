import reactHooks from "eslint-plugin-react-hooks";
import { config as base } from "./base.js";

/**
 * React-app config. Adds the hooks rules on top of the base TS config.
 *
 * `rules-of-hooks` is an error — violating it is always a bug.
 * `exhaustive-deps` is a warning, the React team's own default: it has real
 * false positives, but a missing dependency caused a production infinite
 * render loop in this codebase, so it must at least be visible.
 */
/** @type {import("eslint").Linter.Config[]} */
export const config = [
  ...base,
  {
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
];
