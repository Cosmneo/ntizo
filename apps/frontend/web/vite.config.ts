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
