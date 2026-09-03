import { useMutation, useQueryClient } from "@tanstack/react-query";
import { openSupportRequest, type OpenSupportRequestInput } from "@/features/help-center/data/support.repository";
import { messagingErrorCode } from "@/features/messaging/viewmodel/messaging-error";

/**
 * Opening a request, and putting the reader in front of it.
 *
 * Invalidates the whole `messaging` key rather than one list: a new request
 * belongs in the Help Center's list, in `/messages` (or the workspace's
 * inbox), and its first message is already the thread's last — three cached
 * answers, all now stale.
 *
 * Resolves the new thread id so the caller can open the conversation, or
 * `null` when the server refused — the refusal is in `errorCode`, and a
 * caller that navigated on a rejected promise would land on a thread that
 * does not exist.
 */
export function useOpenSupportRequest() {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: (input: OpenSupportRequestInput) => openSupportRequest(input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["messaging"] }),
  });

  return {
    openRequest: async (input: OpenSupportRequestInput): Promise<string | null> => {
      try {
        return await mutation.mutateAsync(input);
      } catch {
        return null;
      }
    },
    opening: mutation.isPending,
    errorCode: messagingErrorCode(mutation.error),
  };
}
