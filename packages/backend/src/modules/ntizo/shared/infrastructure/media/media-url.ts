/**
 * Where public media is served from, captured once per isolate.
 *
 * `MEDIA_PUBLIC_URL_BASE` is a Cloudflare per-request binding on `c.env`, not
 * an entry in `process.env`, so a repository deep in the read tier cannot read
 * it directly. The `/api/*` pre-handler hands it here and readers ask for it
 * lazily — the same shape the reference project uses for its media adapter,
 * for the same reason.
 *
 * A key is stored, never a URL. That is what lets the bucket move, the public
 * base change, or a CDN appear in front of it without rewriting every row —
 * and it is why this composition happens at read time rather than at write.
 */
let base: string | null = null;

/**
 * Where this API serves the bucket itself, when nothing else does.
 *
 * `/api/media/*` streams objects straight out of R2 — the route exists and is
 * already used. Kept apart from `base` rather than folded into it so the two
 * can be learned independently: a deployment has a public base and an origin,
 * a local run has only an origin, and neither should overwrite the other.
 */
let ownOrigin: string | null = null;

export function configureMediaUrlBase(
  value: string | undefined,
  /** This API's own `/api/media` prefix, used when no public base is set. */
  fallback?: string | undefined,
): void {
  // First call wins for each, independently. The bindings are identical
  // request to request, and a later undefined must not erase what is known.
  if (base === null && value) base = value;
  if (ownOrigin === null && fallback) ownOrigin = fallback;
}

/**
 * The public URL for a key, or null when there is nowhere to serve it from.
 *
 * The public base first, then this API's own `/api/media` route. Returning
 * null for want of a public base is what made a local run look like it had
 * lost the images: the read projections drop keys whose URL is null, so a
 * provider with three photographs saw an empty list and nothing to say why.
 * The API can serve them; it may as well say so.
 *
 * Still null when neither is known — a URL cannot be invented from nothing,
 * and a plausible link that 404s is worse than an absent one.
 */
export function mediaUrl(key: string | null | undefined): string | null {
  if (!key) return null;
  const prefix = base ?? ownOrigin;
  if (!prefix) return null;
  return `${prefix}/${key}`;
}

/** Test seam. */
export function __resetMediaUrlBaseForTests(): void {
  base = null;
  ownOrigin = null;
}
