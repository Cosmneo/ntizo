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

export function configureMediaUrlBase(value: string | undefined): void {
  // First call wins. The binding is identical request to request, and a later
  // undefined must not erase a base that is already known.
  if (base === null && value) base = value;
}

/**
 * The public URL for a key, or null when there is nowhere to serve it from.
 *
 * Null rather than a guessed URL: locally there is no public base, and a
 * plausible-looking link that 404s is worse than an absent one — the caller
 * can render a placeholder for null and cannot detect a bad URL at all.
 */
export function mediaUrl(key: string | null | undefined): string | null {
  if (!key || !base) return null;
  return `${base}/${key}`;
}

/** Test seam. */
export function __resetMediaUrlBaseForTests(): void {
  base = null;
}
