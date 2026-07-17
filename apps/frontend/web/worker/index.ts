interface Env {
  ASSETS: { fetch: (input: Request | URL | string) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    // Try a static asset first; if present, serve it as-is.
    const asset = await env.ASSETS.fetch(request);
    if (asset.status !== 404) return asset;
    // SPA fallback: serve index.html for deep client routes.
    const shell = await env.ASSETS.fetch(new URL("/index.html", url.origin));
    return new Response(shell.body, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    });
  },
};
