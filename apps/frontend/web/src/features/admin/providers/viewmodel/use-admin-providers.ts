import { useQuery } from "@tanstack/react-query";
import { adminProviderQueries } from "../data/admin-provider.repository";

export function useAdminProviders(input: {
  status?: string;
  search?: string;
}) {
  // Server-side, not filtered in the browser: this is the one list that grows
  // without bound, and deciding which fifty of ten thousand to draw is not a
  // decision the browser can make.
  return useQuery(adminProviderQueries.all(input));
}
