import { API_BASE_URL } from "@/shared/lib/api/auth-client";

/** What `/api/media/:providerId/:kind` answers with. */
export interface UploadedImage {
  key: string;
  /** Null when no public base is configured — locally, that is every upload. */
  url: string | null;
}

export type MediaKind = "logo" | "photo";

/**
 * Thrown with the server's own error code so the caller can say something
 * specific. A generic "upload failed" hides the difference between a file
 * that is too large and a session that has expired.
 */
export class MediaUploadError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "MediaUploadError";
  }
}

/**
 * Sends one image.
 *
 * `multipart/form-data`, not GraphQL: the schema would have to carry bytes as
 * base64, which inflates them by a third and buffers the whole thing in the
 * Worker's JSON parser. `credentials: "include"` because the route reads the
 * session cookie, and the same cookie is what proves membership of this
 * provider — an authenticated stranger is refused with 403.
 *
 * No `Content-Type` header is set on purpose: the browser must add its own
 * with the multipart boundary, and setting it by hand produces a body the
 * server cannot parse.
 */
export async function uploadProviderImage(
  providerId: string,
  kind: MediaKind,
  file: File,
): Promise<UploadedImage> {
  const form = new FormData();
  form.append("file", file);

  const response = await fetch(`${API_BASE_URL}/api/media/${providerId}/${kind}`, {
    method: "POST",
    credentials: "include",
    body: form,
  });

  const text = await response.text();
  let body: (UploadedImage & { error?: string }) | undefined;
  if (text) {
    try {
      body = JSON.parse(text) as UploadedImage & { error?: string };
    } catch {
      // A proxy error page or a truncated response is not JSON. Fall through
      // to the status-based error rather than throwing a raw SyntaxError.
    }
  }

  if (!response.ok) {
    throw new MediaUploadError(body?.error ?? `HTTP_${response.status}`);
  }
  if (!body) throw new MediaUploadError("MALFORMED_RESPONSE");
  return { key: body.key, url: body.url };
}
