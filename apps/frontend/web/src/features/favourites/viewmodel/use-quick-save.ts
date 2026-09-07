import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FAVOURITES_QUERY_KEY,
  quickSaveFavourite,
} from "@/features/favourites/data/favourites.repository";
import type { FavouriteTargetType } from "@/features/favourites/domain/types";
import { favouritesErrorCode } from "@/features/favourites/viewmodel/favourites-error";
import {
  cancelMarks,
  patchMarks,
  restoreMarks,
  type MarksSnapshot,
} from "@/features/favourites/viewmodel/optimistic-marks";
import { useSignInGate } from "@/features/favourites/viewmodel/use-sign-in-gate";

/**
 * The heart on a card: one tap, saved into the default list.
 *
 * **Optimistic**, and it has to be — see `patchMarks`. The heart fills the
 * instant it is tapped and only goes back if the server refuses.
 *
 * **Signed out it navigates instead of firing** — see `useSignInGate`.
 *
 * Invalidates the whole `["favourites"]` prefix on settle rather than one
 * query: a quick save changes the marks on every cached page of cards *and*
 * the default list's `itemCount` and `coverUrls` on the index page, and the
 * very first tap creates the default list that page lists. Enumerating those
 * keys here would be a second place to get them wrong — the same whole-prefix
 * reasoning `useSendMessage` gives for `["messaging"]`.
 *
 * **Settled, not success.** A failed save still needs the server's truth back;
 * `restoreMarks` is only this side's guess at it.
 */
export function useQuickSave() {
  const qc = useQueryClient();
  const { signedIn, goToSignIn } = useSignInGate();

  const mutation = useMutation<
    string[],
    unknown,
    { targetType: FavouriteTargetType; targetId: string },
    { previous: MarksSnapshot }
  >({
    mutationFn: ({ targetType, targetId }) => quickSaveFavourite(targetType, targetId),
    onMutate: async ({ targetType, targetId }) => {
      await cancelMarks(qc, targetType);
      return { previous: patchMarks(qc, targetType, targetId, true) };
    },
    onError: (_error, _variables, context) => restoreMarks(qc, context?.previous),
    onSettled: () => qc.invalidateQueries({ queryKey: [FAVOURITES_QUERY_KEY] }),
  });

  return {
    quickSave: (targetType: FavouriteTargetType, targetId: string) => {
      if (!signedIn) {
        goToSignIn();
        return;
      }
      mutation.mutate({ targetType, targetId });
    },
    saving: mutation.isPending,
    /**
     * Every list the listing is now in, once the server has answered — the
     * field returns them precisely so a dialog opened straight after a tap
     * already knows its tick marks and need not ask again.
     */
    listIds: mutation.data,
    /** `"UNAUTHENTICATED"` when a session expired between render and tap. See `favouritesErrorCode`. */
    errorCode: favouritesErrorCode(mutation.error),
  };
}
