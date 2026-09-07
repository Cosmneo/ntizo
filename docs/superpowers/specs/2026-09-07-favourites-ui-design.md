# The heart and the dialog — Design

**Goal:** the two surfaces Tasks 10 and 11 of `docs/superpowers/plans/2026-08-27-favourites.md` describe, redrawn for the listings refresh that shipped after that plan was written.

The approved mockup is `2026-09-07-favourites-ui.mockup.html`, beside this file. Behaviour is **not** re-decided here — the 2026-08-27 spec settled it and the backend implements it. This decides only what those things look like now, and which components they attach to.

## Why the plan needed redrawing

Tasks 10 and 11 name `service-listing-card.tsx`, `provider-listing-card.tsx` and `ListingMedia`'s `favourite` slot. All three were deleted by the listings refresh (`2026-09-06-listings-refresh-design.md`). The results are now:

| plan says | actually exists |
|---|---|
| `ListingMedia` with a `favourite` slot | `TileMedia` in `shared/components/browse/result-tile.tsx`, no slot |
| `ServiceListingCard` | `ServiceTile` composing `ResultTile` |
| `ProviderListingCard` | `ProviderRow` composing `ResultRow` |

The refresh's own spec said the tile would "keep a slot that renders nothing"; the built `ResultTile` takes `media / title / byline / price` and has none. Adding it back is part of this work.

## The constraint

The refresh removed every control from a result on purpose. `ResultTile`'s own doc comment: *"There is no second control on the tile."* The price carries the eye, the tile is the link, and the page spends its one blue on the search button. A heart is the thing that design took away, so it has to cost as little as possible.

Three rules follow.

**On the photograph, never in the words.** The three text lines keep their column, so a saved tile and an unsaved one are exactly the same height and the grid never shifts when a mark arrives.

**A white disc, not a bare icon.** The photographs belong to providers and can be any colour; a stroke-only heart disappears on a pale one. `rgba(255,255,255,.92)` with a 1px soft shadow is the smallest chrome that survives every photo, and it is the only chrome on a result.

**One rule for both shapes.** Below `sm` a result is a hairline row with a 116px square photograph; the heart stays on the photograph, at 27px rather than 32px, so a small photo does not become mostly button.

## A saved heart is navy

`--color-favourite: #e5397a` from the 2026-08-27 spec **is not adopted**, and the reasoning is worth keeping because it looks like a reversal.

That spec argued a saved heart must leave the palette, because in the brand blue it would read as a second call to action competing with the CTA below it. That was true of a design whose accent was blue and whose cards carried blue buttons. This design has no buttons on a result, and its accent appears once per page in the header.

What this design does have is a settled vocabulary for **chosen**: filled navy. The active filter pill, the current page number, the verified seal. A filled navy heart says "on" in a sentence the page already speaks, and the palette stays at navy, one blue, and the amber star.

The cost is that navy is quieter than red, and a reader scanning fast may register the state less instantly. Accepted: the heart's state is also carried by its `aria-pressed` and its accessible name, and the reader who cares is the one who came back to find the thing.

No new token. The heart uses `--color-headline`, which is already navy in light and near-white in dark, so the filled heart inverts correctly in dark mode without a second definition.

## The heart

`FavouriteButton({ targetType, targetId, saved, onSaved })` in `features/favourites/ui/favourite-button.tsx`.

- **`position: relative`, above the tile's whole-surface title link.** The link is an `::after` spanning the tile, so the button must sit above it and call `preventDefault()` **and** `stopPropagation()` — both, because the overlay is an anchor and a click on a child still activates it.
- **Unsaved:** quick-save, then `onSaved({ listIds })` so the page opens the dialog already knowing the answer.
- **Saved:** `onSaved` only. Pressing a filled heart opens the dialog; removing happens by unticking there, not by a second meaning for the same button.
- **Signed out it still renders.** Hiding it teaches nobody the feature exists. Pressing it routes to `/sign-in` with the current path as the return target, through `useSignInGate`.
- **Its accessible name changes with its state** (`Save` / `Saved`) and it carries `aria-pressed`, so the state is not only a colour.

The marks for a page come from **one** `useFavouriteMarks` call in the page, threaded down as a prop. Never a hook inside the tile, which is one request per tile.

## The dialog

`SaveToListDialog` in `features/favourites/ui/save-to-list-dialog.tsx`.

Two panels from `md` up, 640px wide: the listing on the left, the lists on the right. Below `md` it is a bottom sheet and the listing's photograph is the first thing to go — the name and the price carry the identification in the subtitle instead.

**It files; it never asks permission.** The heart already saved. The header says so in the past tense — "Guardado em Favoritos" — and the only button is Done. There is no Cancel, because there is nothing to cancel and a Cancel would imply the save had not happened.

**The listing is on screen.** The dialog opens from a grid of twenty-four; without the photograph and the name, nothing says which one it is about. The left panel's photo is square rather than 4:3 — the right column's height is set by the list of lists, and 4:3 left a band of white under the price that read as a panel that had failed to load.

**Checkboxes, not radios.** Real `<input type="checkbox">` visually restyled, so the browser gives keyboard operation, label association and announced state for free. "Casa nova" and "Urgente" are both true about the same electrician.

**The 2×2 mosaic** draws the list's own most recent items, up to four, and draws what it has rather than padding. A list with items but no photographs is not the same as an empty one: the empty one draws an outline heart instead.

**Creating a list happens in place**, on the row that offers it, directly under the header so the lists it will join stay visible. A modal over a modal hides the thing being saved behind the thing deciding where to put it.

**Unticking every list is the delete**, and it does not look like one, so the footer says what just happened in plain words rather than asking "are you sure" about a thing already done.

**The search field appears only above six lists.** A search box over three rows is a control with nothing to do.

## Files

**Created**

| File | Responsibility |
|---|---|
| `features/favourites/ui/favourite-button.tsx` | the heart |
| `features/favourites/ui/save-to-list-dialog.tsx` | the dialog and its sheet |
| `features/favourites/ui/list-cover.tsx` | the 2×2 mosaic |

**Modified**

- `shared/components/browse/result-tile.tsx` — a `favourite` slot on `ResultTile`, and the same on `TileMedia` so the button can sit on the photograph
- `shared/components/browse/result-row.tsx` — the same slot for a provider row
- `features/directory/services/ui/service-tile.tsx`, `features/directory/ui/provider-row.tsx` — accept and pass a `favourite` node
- `features/directory/services/ui/services-browse-page.tsx`, `features/directory/ui/directory-page.tsx` — one marks query, the dialog's state, the heart per result
- `shared/locales/*/directory.json` — the heart's and the dialog's copy, eight locales

## Not in this work

`/favourites` and `/favourites/$listId` are Task 12 and stay on the placeholder. This is the heart and the dialog only, so a person can save from a listing page and file it, and see the result the next time they load the page.
