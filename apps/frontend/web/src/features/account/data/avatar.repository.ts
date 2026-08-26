import { API_BASE_URL } from "@/shared/lib/api/auth-client";

/** What `POST /api/media/avatar` answers with. */
export interface UploadedAvatar {
  key: string;
  /** Null when no public base is configured — locally, that is every upload. */
  url: string | null;
}

/**
 * Carries the server's own code so the caller can say something specific. A
 * generic "upload failed" hides the difference between a file that is too
 * large and a session that has expired.
 */
export class AvatarUploadError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "AvatarUploadError";
  }
}

/**
 * Sends the photo.
 *
 * `multipart/form-data`, not GraphQL: the schema would have to carry bytes as
 * base64, inflating them by a third and buffering the whole thing in the
 * Worker's JSON parser. `credentials: "include"` because the route takes the
 * subject from the session cookie — there is no user id to send.
 *
 * No `Content-Type` header on purpose: the browser must add its own with the
 * multipart boundary.
 */
export async function uploadMyAvatar(file: File): Promise<UploadedAvatar> {
  const form = new FormData();
  form.append("file", file);

  const response = await fetch(`${API_BASE_URL}/api/media/avatar`, {
    method: "POST",
    credentials: "include",
    body: form,
  });

  const text = await response.text();
  let body: (UploadedAvatar & { error?: string }) | undefined;
  if (text) {
    try {
      body = JSON.parse(text) as UploadedAvatar & { error?: string };
    } catch {
      // A proxy error page or a truncated response is not JSON. Fall through
      // to the status-based error rather than throwing a raw SyntaxError.
    }
  }

  if (!response.ok) throw new AvatarUploadError(body?.error ?? `HTTP_${response.status}`);
  if (!body) throw new AvatarUploadError("MALFORMED_RESPONSE");
  return { key: body.key, url: body.url };
}
