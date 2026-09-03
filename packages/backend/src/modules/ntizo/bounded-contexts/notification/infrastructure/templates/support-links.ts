import { appBaseUrl } from "./copy";

/** Where the requester finds their request: their inbox, or the provider's. */
export function requesterThreadUrl(payload: Record<string, unknown>): string {
  const threadId = String(payload["threadId"] ?? "");
  if (payload["requestAudience"] === "provider" && typeof payload["providerId"] === "string") {
    return `${appBaseUrl()}/provider/${payload["providerId"]}/messages?thread=${threadId}`;
  }
  return `${appBaseUrl()}/messages?thread=${threadId}`;
}

/** Where an admin finds it: the queue entry. */
export function adminRequestUrl(payload: Record<string, unknown>): string {
  return `${appBaseUrl()}/admin/support/${String(payload["threadId"] ?? "")}`;
}

/** The subject as a template may print it — never raw. */
export function subjectOf(payload: Record<string, unknown>): string {
  return typeof payload["subject"] === "string" ? payload["subject"] : "";
}
