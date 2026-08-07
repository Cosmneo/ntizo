import { API_BASE_URL } from "@/shared/lib/api/auth-client";
import type {
  CreateProviderBody,
  InviteMemberBody,
  ProviderDetail,
  ProviderRole,
  ProviderSummary,
  RegisterMeBody,
} from "../domain/types";

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE_URL}/api${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    ...init,
  });

  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!res.ok) {
    const msg =
      (body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : null) ?? res.statusText;
    throw new ApiError(res.status, msg, body);
  }

  return body as T;
}

export function listMyProviders() {
  return request<ProviderSummary[]>("/providers/mine");
}

export function registerMe(body: RegisterMeBody = {}) {
  return request<{ providerId: string }>("/providers/register-me", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function createProvider(body: CreateProviderBody) {
  return request<{ providerId: string } | ProviderDetail>("/providers", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function getProvider(id: string) {
  return request<ProviderDetail>(`/providers/${id}`);
}

export function updateProvider(
  id: string,
  body: Partial<Pick<ProviderDetail, "name" | "description" | "address">>,
) {
  return request<ProviderDetail>(`/providers/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function deactivateProvider(id: string) {
  return request<{ ok: true }>(`/providers/${id}/deactivate`, {
    method: "POST",
  });
}

export function inviteMember(providerId: string, body: InviteMemberBody) {
  return request<{ inviteId: string; token?: string }>(
    `/providers/${providerId}/invites`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export function acceptInvite(token: string) {
  return request<{ providerId: string }>(
    `/providers/invites/${token}/accept`,
    { method: "POST" },
  );
}

export function revokeInvite(providerId: string, inviteId: string) {
  return request<{ ok: true }>(
    `/providers/${providerId}/invites/${inviteId}`,
    { method: "DELETE" },
  );
}

export function removeMember(providerId: string, userId: string) {
  return request<{ ok: true }>(
    `/providers/${providerId}/members/${userId}`,
    { method: "DELETE" },
  );
}

export function updateMemberRole(
  providerId: string,
  userId: string,
  role: ProviderRole,
) {
  return request<{ ok: true }>(
    `/providers/${providerId}/members/${userId}/role`,
    { method: "PATCH", body: JSON.stringify({ role }) },
  );
}

export function fetchCurrentUser() {
  return request("/me").catch((e) => {
    if (e instanceof ApiError && (e.status === 401 || e.status === 403))
      return null;
    throw e;
  });
}
