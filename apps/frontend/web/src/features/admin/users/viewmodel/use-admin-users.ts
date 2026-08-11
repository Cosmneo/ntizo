import { useQuery } from "@tanstack/react-query";
import { adminUserQueries } from "../data/admin-user.repository";

export function useAdminUsers(input: { role?: string; search?: string }) {
  // Server-side, like the provider queue: this is the largest list on the
  // platform by definition — every provider is also a user — so deciding
  // which fifty of ten thousand to draw is not the browser's decision.
  return useQuery(adminUserQueries.all(input));
}
