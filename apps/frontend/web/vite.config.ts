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
      pages: [{ path: "/" }],
      prerender: { enabled: true, crawlLinks: false, autoStaticPathsDiscovery: false },
    }),
    viteReact(),
  ],
  server: {
    port: 3000,
    proxy: {
      "/api": DEV_WORKER_ORIGIN,
      "/graphql": DEV_WORKER_ORIGIN,
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    css: true,
  },
});
