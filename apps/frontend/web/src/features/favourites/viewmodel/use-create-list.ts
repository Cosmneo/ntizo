import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FAVOURITES_QUERY_KEY,
  createFavouriteList,
} from "@/features/favourites/data/favourites.repository";
import { favouritesErrorCode } from "@/features/favourites/viewmodel/favourites-error";
import { useSignInGate } from "@/features/favourites/viewmodel/use-sign-in-gate";

/**
 * A new, empty list.
 *
 * No optimistic update, and the contrast with `useQuickSave` is the point: a
 * heart has to answer instantly because the reader is looking straight at it,
 * whereas a new list has nothing to show until the server has given it an id —
 * an invented row would have no id for the very next gesture (ticking the
 * listing into it) to use. The same trade `useSendMessage` makes for a sent
 * message.
 *
 * Invalidates the whole `["favourites"]` prefix on success: a new list changes
 * the index page and the dialog's tick list, and nothing else.
 *
 * **Signed out it navigates instead of firing** — see `useSignInGate`.
 *
 * The name is passed through untouched. It is trimmed and bounded server-side
 * (1..60 characters, `FAVOURITE_LIST_NAME_MAX_LENGTH`) and refused as
 * `"VALIDATION_ERROR"` past that — a dialog built on this hook should stop
 * somebody at that length rather than let them find out on submit, which is
 * the composer's job, not this hook's.
 */
export function useCreateList() {
  const qc = useQueryClient();
  const { signedIn, goToSignIn } = useSignInGate();

  const mutation = useMutation({
    mutationFn: (name: string) => createFavouriteList(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: [FAVOURITES_QUERY_KEY] }),
  });

  return {
    createList: (name: string) => {
      if (!signedIn) {
        goToSignIn();
        return;
      }
      mutation.mutate(name);
    },
    creating: mutation.isPending,
    /** The new list's id once the server has answered — what a dialog ticks next. */
    createdId: mutation.data,
    /** `"VALIDATION_ERROR"` for a name outside 1..60 characters. See `favouritesErrorCode`. */
    errorCode: favouritesErrorCode(mutation.error),
  };
}
