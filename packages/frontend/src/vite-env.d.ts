/**
 * Vite's `?raw` suffix, declared for TypeScript.
 *
 * Vitest resolves `import css from "./globals.css?raw"` at runtime without
 * being told anything, but `tsc --noEmit` does not — it sees a module
 * specifier it cannot resolve and fails `typecheck` and `build` on a file
 * that runs perfectly well.
 *
 * Declared here rather than by pulling in `vite/client`'s whole ambient
 * surface: this package ships components and has no dev server, no
 * `import.meta.env`, and no asset pipeline of its own. One suffix is what it
 * actually uses.
 */
declare module "*?raw" {
  const content: string;
  export default content;
}
