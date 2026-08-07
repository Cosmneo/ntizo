import { app } from "./api";

// Bun / Node fetch server entrypoint.
// TODO(ntizo): swap to Cloudflare Workers default export like flowzao once wrangler is wired.
export default {
  port: Number(process.env.PORT ?? 8788),
  fetch: app.fetch,
};
