import js from "@eslint/js";
import tseslint from "typescript-eslint";

/** @type {import("eslint").Linter.Config[]} */
export const config = [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ["dist/**", ".next/**", "node_modules/**"],
  },
  {
    rules: {
      // A leading underscore is the established signal for "destructured or
      // bound deliberately, and deliberately not used" — the `asChild: _asChild`
      // pattern in the UI primitives exists precisely so the prop is consumed
      // and NOT spread onto the DOM. Without this, the convention and the
      // linter contradict each other and the only ways out are a suppression
      // comment on every site or deleting code that has to stay.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
    },
  },
];
