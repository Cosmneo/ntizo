import { API_BASE_URL } from "@/shared/lib/api/auth-client";
import type { ProviderDocumentType } from "@ntizo/shared";

export interface UploadedDocument {
  key: string;
  documentId: string;
  status: string;
  /** True when this replaced something a reviewer had already accepted. */
  reopensReview: boolean;
}

/** Carries the server's own code so the caller can say something specific. */
export class DocumentUploadError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "DocumentUploadError";
  }
}

/**
 * Sends one identity or compliance document.
 *
 * Its own mount rather than GraphQL, for the same reason as media: a multipart
 * body is not something GraphQL carries well. Unlike media, nothing here comes
 * back as a URL — the bucket is private, and the only way to see one of these
 * is to ask the Worker while holding a session that is allowed to.
 */
export async function uploadProviderDocument(
  providerId: string,
  type: ProviderDocumentType,
  file: File,
): Promise<UploadedDocument> {
  const form = new FormData();
  form.append("file", file);

  const response = await fetch(
    `${API_BASE_URL}/api/documents/${providerId}/${type}`,
    {
      method: "POST",
      credentials: "include",
      body: form,
    },
  );

  const text = await response.text();
  let body: (UploadedDocument & { error?: string }) | undefined;
  if (text) {
    try {
      body = JSON.parse(text) as UploadedDocument & { error?: string };
    } catch {
      // A proxy error page or a truncated response is not JSON. Fall through
      // to the status-based error rather than throwing a raw SyntaxError.
    }
  }

  if (!response.ok)
    throw new DocumentUploadError(body?.error ?? `HTTP_${response.status}`);
  if (!body) throw new DocumentUploadError("MALFORMED_RESPONSE");
  return body;
}
