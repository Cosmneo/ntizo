import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FAVOURITES_QUERY_KEY,
  setFavouriteLists,
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
 * The dialog's Save: exactly which of the reader's lists hold this listing.
 *
 * The whole desired membership at once, never an add/remove pair — a pair
 * would make this side diff two states and send the difference, which is where
 * a stale card sends `add` for something already added, gets a conflict, and
 * the row flickers.
 *
 * **`listIds: []` is the unsave gesture**, and it is why the optimistic
 * update below is `listIds.length > 0` rather than an unconditional fill:
 * unticking every list is how somebody removes a favourite, and the marks
 * cache has to follow, or the card keeps a filled heart until a reload.
 *
 * Optimistic, whole-prefix invalidation on settle, and a signed-out redirect
 * instead of a doomed mutation — all three for the same reasons `useQuickSave`
 * gives; see that hook's doc comment and `optimistic-marks.ts`.
 */
export function useSetLists() {
  const qc = useQueryClient();
  const { signedIn, goToSignIn } = useSignInGate();

  const mutation = useMutation<
    string[],
    unknown,
    { targetType: FavouriteTargetType; targetId: string; listIds: string[] },
    { previous: MarksSnapshot }
  >({
    mutationFn: ({ targetType, targetId, listIds }) =>
      setFavouriteLists(targetType, targetId, listIds),
    onMutate: async ({ targetType, targetId, listIds }) => {
      await cancelMarks(qc, targetType);
      return { previous: patchMarks(qc, targetType, targetId, listIds.length > 0) };
    },
    onError: (_error, _variables, context) => restoreMarks(qc, context?.previous),
    onSettled: () => qc.invalidateQueries({ queryKey: [FAVOURITES_QUERY_KEY] }),
  });

  return {
    setLists: (
      targetType: FavouriteTargetType,
      targetId: string,
      listIds: string[],
    ) => {
      if (!signedIn) {
        goToSignIn();
        return;
      }
      mutation.mutate({ targetType, targetId, listIds });
    },
    saving: mutation.isPending,
    /** The membership the server settled on, once it has answered. */
    listIds: mutation.data,
    /**
     * Whether the last write was refused — and the one a caller drawing a
     * message has to read.
     *
     * Separate from `errorCode` for the reason `useListsFor.failed` gives: a
     * network failure is not a `GraphqlError`, so `favouritesErrorCode`
     * answers `undefined` for it by contract, which is indistinguishable from
     * "nothing has gone wrong". It is also the failure this mutation is most
     * likely to meet, since the optimistic patch has already told the reader
     * it worked.
     *
     * It clears itself: the next `mutate` puts the mutation back into
     * `pending`, so a message drawn from this disappears the moment the reader
     * tries again.
     */
    failed: mutation.isError,
    /** `"UNAUTHENTICATED"` when a session expired between render and save. See `favouritesErrorCode`. */
    errorCode: favouritesErrorCode(mutation.error),
  };
}
