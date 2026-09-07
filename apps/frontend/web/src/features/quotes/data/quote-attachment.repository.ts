import { API_BASE_URL } from "@/shared/lib/api/auth-client";

/**
 * A quote attachment's bytes.
 *
 * A different route from the messaging one — `/api/quote/attachments/:id`
 * checks quote membership, not thread membership — but the same posture:
 * the session cookie is the only credential, the server answers 403 for both
 * "not yours" and a malformed id, and nothing about who else is on the quote
 * leaks through the difference.
 */
export async function fetchQuoteAttachmentBlob(attachmentId: string): Promise<Blob> {
  const response = await fetch(`${API_BASE_URL}/api/quote/attachments/${attachmentId}`, {
    credentials: "include",
  });
  if (!response.ok) throw new Error(`HTTP_${response.status}`);
  return response.blob();
}
