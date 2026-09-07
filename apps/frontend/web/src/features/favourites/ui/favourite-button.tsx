import { useEffect, useRef, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { Heart } from "lucide-react";
import { cn } from "@ntizo/frontend-ui";
import type { FavouriteTargetType } from "@/features/favourites/domain/types";
import { useQuickSave } from "@/features/favourites/viewmodel/use-quick-save";
import { useSignInGate } from "@/features/favourites/viewmodel/use-sign-in-gate";

/** What a press hands back to the page, so the dialog can open knowing it. */
export interface FavouriteSaveResult {
  /**
   * Every list the listing is now in — present only when *this* press is what
   * saved it, because that is the press `favouriteQuickSave` answered.
   *
   * A press on an already-filled heart leaves it out rather than guessing at
   * `[]`: the dialog asks `favouriteListsFor` for itself in that case, and an
   * empty array here would be read as "in no list", which is the one thing a
   * filled heart cannot mean.
   */
  listIds?: string[];
}

/**
 * The heart on a result, and the only control the listings refresh puts back
 * on one.
 *
 * **On the photograph, never in the words.** It positions itself against the
 * media box it is handed to — `TileMedia`'s for a tile, `ResultRow`'s media
 * cell for a row — so the three lines of text keep their column and a saved
 * result is exactly as tall as an unsaved one. Nothing in the grid moves when
 * a mark arrives.
 *
 * **A white disc, not a bare icon.** The photographs belong to providers and
 * can be any colour; a stroke-only heart disappears on a pale one. The disc
 * follows the theme rather than being a fixed white: in dark mode the filled
 * heart is near-white (see below), and a near-white heart on a white disc is
 * no heart at all.
 *
 * **A saved heart is navy — deliberately not the rose the 2026-08-27 spec
 * chose.** That spec argued a saved heart had to leave the palette because in
 * the brand blue it would read as a second call to action competing with the
 * CTA below it; that was true of a design whose results carried blue buttons.
 * This design has no button on a result and spends its one blue in the header.
 * What it does have is a settled vocabulary for *chosen*: filled navy, worn by
 * the active filter pill, the current page number and the verified seal. So
 * the heart wears `--color-headline`, which is that navy in light and
 * near-white in dark — no new token, and the fill inverts with the theme
 * without a second definition.
 *
 * The cost is that navy is quieter than red and a reader scanning fast may
 * register the state less instantly. What pays for it is that the state is
 * also carried by `aria-pressed` and by the accessible name, which change
 * together — the colour is never the only thing saying "saved".
 *
 * **The marks are a prop, never a query of its own.** One `useFavouriteMarks`
 * call in the page answers for every result on it; a hook in here would be one
 * request per tile, twenty-four to a page. See `useFavouriteMarks`.
 */
export function FavouriteButton({
  targetType,
  targetId,
  saved,
  onSaved,
}: {
  targetType: FavouriteTargetType;
  targetId: string;
  /** From the page's one marks query. */
  saved: boolean;
  /**
   * Opens the save-to-a-list dialog, on both meanings of a press. Optional
   * while that dialog does not exist yet: without it the heart still saves,
   * which is the whole of what a quick save is.
   */
  onSaved?: (result: FavouriteSaveResult) => void;
}) {
  const { t } = useTranslation("directory");
  const { quickSave, listIds } = useQuickSave();
  const { signedIn, goToSignIn } = useSignInGate();

  /**
   * The lists already handed to `onSaved`, so a re-render — or a caller that
   * passes a fresh arrow every time — cannot open the dialog twice for one
   * press. `listIds` is this button's own mutation data, so it becomes
   * defined exactly once, when this heart's save answers.
   */
  const announced = useRef<string[] | undefined>(undefined);
  useEffect(() => {
    if (!listIds || listIds === announced.current) return;
    announced.current = listIds;
    onSaved?.({ listIds });
  }, [listIds, onSaved]);

  function press(event: MouseEvent<HTMLButtonElement>) {
    // Both, and before anything else. The result's title link is an `::after`
    // spanning the whole tile, so this button is a control standing inside
    // another control's target: `stopPropagation` keeps the click off any
    // anchor above it, and `preventDefault` cancels the press's own default
    // action. Either one alone has let a heart navigate instead of save, and
    // the reader cannot tell that apart from a misclick.
    event.preventDefault();
    event.stopPropagation();

    // Asked here and not left to `useQuickSave`'s own gate, because the
    // filled-heart branch below never reaches it: signed out, a press on
    // either state has to end up at sign-in with the way back, not silently
    // do nothing.
    if (!signedIn) {
      goToSignIn();
      return;
    }

    // Pressing a filled heart opens the dialog and saves nothing. Removing is
    // unticking every list there, not a second meaning for the same button —
    // and a second quick save would file the listing right back into the
    // default list the reader may have just moved it out of.
    if (saved) {
      onSaved?.({});
      return;
    }

    quickSave(targetType, targetId);
  }

  return (
    <button
      type="button"
      // The name changes with the state, so a screen-reader user is not told
      // "Save" by a heart that is already filled.
      aria-label={t(saved ? "favouriteSaved" : "favouriteSave")}
      aria-pressed={saved}
      onClick={press}
      className={cn(
        // `z-[3]` is what puts it above the title link's `::after`, which
        // covers the whole result and — being later in the tree than the
        // photograph — otherwise paints over the heart and takes its clicks.
        // Above the provider row's logo (`z-[2]`) for the same reason.
        "absolute top-1.5 right-1.5 z-[3] grid h-[27px] w-[27px] place-items-center rounded-full",
        // 27px on the phone's 116px-square photograph, 32px from `sm` where
        // the tile's picture is the full width of a grid cell. A small photo
        // must not become mostly button.
        "sm:top-2.5 sm:right-2.5 sm:h-8 sm:w-8",
        // The theme's own ground at 92%, which is exactly the mockup's
        // `rgba(255,255,255,.92)` in light and its inverse in dark. The
        // shadow is the disc's only edge: on a photograph a border would be a
        // second line competing with the crop.
        "bg-[var(--color-background)]/92 shadow-[0_1px_3px_rgba(9,20,45,.18)]",
        "transition-transform duration-150 ease-out hover:scale-[1.08]",
        // Headline navy, not the ring token: the ring token is the site's
        // blue — the header's and the search button's — and nothing in the
        // results wears it. The same reasoning `TILE_TITLE_LINK_CLASS` gives.
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-headline)] focus-visible:ring-offset-2",
      )}
    >
      <Heart
        aria-hidden="true"
        strokeWidth={1.9}
        className={cn(
          "h-3.5 w-3.5 text-[var(--color-headline)] sm:h-[17px] sm:w-[17px]",
          saved ? "fill-[var(--color-headline)]" : "fill-none",
        )}
      />
    </button>
  );
}
