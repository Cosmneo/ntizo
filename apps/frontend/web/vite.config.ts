import path from "node:path";
import { defineConfig } from "vitest/config";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const DEV_WORKER_ORIGIN = process.env.DEV_WORKER_ORIGIN ?? "http://localhost:8788";

export default defineConfig({
  base: "/",
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  plugins: [
    tailwindcss(),
    // tanstackStart() owns route-tree generation and code-splitting itself
    // (it instantiates @tanstack/router-plugin internally, once per Vite
    // environment) — it is NOT layered on top of a standalone
    // tanstackRouter() plugin. Router options that used to go to that
    // standalone plugin are passed through `router` here instead. Adding a
    // second, separate `tanstackRouter()` plugin alongside this one double-
    // runs the code-splitter transform on every route file and crashes dev
    // with "Duplicate declaration \"hot\"" (verified locally).
    tanstackStart({
      router: {
        routeFileIgnorePattern: "\\.(test|spec)\\.|-guard\\.",
      },
      // Prerender `/` to static HTML at build time. `crawlLinks: false` is
      // deliberate: the landing page links to /sign-in, /provider and
      // /admin, all of which are session-dependent and `ssr: false` —
      // crawling would try (and fail) to prerender routes that cannot
      // render without a user. `autoStaticPathsDiscovery: false` is equally
      // required: it defaults to `true` and independently walks the whole
      // route tree adding every static route to the prerender queue,
      // completely ignoring `crawlLinks` (verified locally — with it left
      // on, /admin, /provider/*, /sign-in and /sign-up all got prerendered
      // too).
      // `/help` joins `/` here, and no other public page does: it is the
      // FAQ, its content is identical for every visitor, and it is the one
      // page among `/about`, `/contact`, `/feedback` and `/careers` worth a
      // search engine indexing ahead of a crawl finding it on its own.
      pages: [{ path: "/" }, { path: "/help" }],
      prerender: { enabled: true, crawlLinks: false, autoStaticPathsDiscovery: false },
    }),
    viteReact(),
  ],
  server: {
    port: 3000,
    proxy: {
      "/api": DEV_WORKER_ORIGIN,
      "/graphql": DEV_WORKER_ORIGIN,
      // The anonymous endpoint needs its own entry. A missing proxy entry
      // shows up as a 404 only in a browser — unit tests mock fetch, so
      // nothing else notices. That is exactly how /graphql was missed once.
      "/public": DEV_WORKER_ORIGIN,
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    css: true,
    /**
     * Two projects for one app, so that route suites — and only route
     * suites — get a wider async bound.
     *
     * Every one of them mounts the router, resolves an async `beforeLoad` and
     * settles a query before anything is assertable, which costs ~450ms on an
     * idle machine and more beside a database-backed backend suite running
     * concurrently under `turbo run test`. Testing Library's one-second
     * default is not enough for that: two of these files went red on a loaded
     * full run, repeatedly, on assertions that pass in isolation. None of them
     * is about latency, so a bound that fails on a loaded machine is testing
     * the machine.
     *
     * **A pattern rather than a call each suite has to remember.** The two
     * previous shapes rotted the same way, one level apart: a `{ timeout }`
     * threaded through every wait is forgotten by the next assertion, and a
     * `widenAsyncTimeout()` per file is forgotten by the next *file* — which
     * is exactly how this came to affect three suites. Nobody has to remember
     * a directory: a fourth route suite is covered by existing.
     *
     * **And still not a global.** `asyncUtilTimeout` set once in
     * `src/test/setup.ts` would widen the bound for 138 files nobody read,
     * some of which may legitimately want a wait to give up quickly. This
     * reaches `src/routes/__tests__/` and nothing else.
     *
     * `extends: true` inherits this block and the whole Vite config with it —
     * the `@` alias and the plugin pipeline — so each project is an `include`
     * and a `setupFiles` and nothing more.
     */
    projects: [
      {
        extends: true,
        test: {
          name: "web",
          exclude: ["**/node_modules/**", "**/dist/**", "src/routes/__tests__/**"],
        },
      },
      {
        extends: true,
        test: {
          name: "routes",
          include: ["src/routes/__tests__/**/*.test.{ts,tsx}"],
          setupFiles: ["./src/test/setup.ts", "./src/test/route-suite-setup.ts"],
        },
      },
    ],
  },
});
