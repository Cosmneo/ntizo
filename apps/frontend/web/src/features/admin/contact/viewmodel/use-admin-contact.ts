import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ContactRequestStatus } from "@ntizo/shared";
import { adminContactQueries, setContactRequestStatus, type AdminContactSearch } from "../data/admin-contact.repository";

export function useAdminContact(search: AdminContactSearch) {
  return useQuery(adminContactQueries.all(search));
}

/** Not optimistic: `openCount` rides on the same payload and would have to be kept in step by hand. */
export function useSetContactRequestStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ requestId, status }: { requestId: string; status: ContactRequestStatus }) =>
      setContactRequestStatus(requestId, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "contact"] }),
  });
}
