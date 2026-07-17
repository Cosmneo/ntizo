import { useQuery } from "@tanstack/react-query";
import type { CurrentUserDTO } from "@ntizo/shared";
import { API_BASE_URL } from "@/shared/lib/api/auth-client";

async function fetchMe(): Promise<CurrentUserDTO | null> {
  const res = await fetch(`${API_BASE_URL}/api/me`, { credentials: "include" });
  if (!res.ok) return null;
  return (await res.json()) as CurrentUserDTO;
}

export function useCurrentUser() {
  return useQuery({ queryKey: ["me"], queryFn: fetchMe });
}
