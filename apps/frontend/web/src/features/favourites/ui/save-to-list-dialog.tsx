import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { Check, Plus, Search } from "lucide-react";
import {
  Checkbox,
  Dialog,
  DialogContent,
  DialogHeader,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  cn,
  useIsMobile,
} from "@ntizo/frontend-ui";
import { BrandImage } from "@/shared/components/brand-image";
import { listDisplayName } from "@/features/favourites/domain/list-name";
import {
  FAVOURITE_LIST_NAME_MAX_LENGTH,
  type FavouriteList,
  type FavouriteTargetType,
} from "@/features/favourites/domain/types";
import { useCreateList } from "@/features/favourites/viewmodel/use-create-list";
import { useListsFor } from "@/features/favourites/viewmodel/use-lists-for";
import { useMyLists } from "@/features/favourites/viewmodel/use-my-lists";
import { useSetLists } from "@/features/favourites/viewmodel/use-set-lists";
import { ListCover } from "@/features/favourites/ui/list-cover";

/**
 * How many lists there have to be before the search field is worth drawing.
 *
 * A search box over three rows is a control with nothing to do — it takes a
 * line of the panel, a tab stop and a moment's reading to tell somebody they
 * can find one of the three things already on screen.
 */
export const SEARCH_VISIBLE_ABOVE = 6;

/** The listing this dialog is about, as the page already knows how to say it. */
export interface SaveToListListing {
  /** The photograph, or null for the site's own placeholder. */
  imageUrl: string | null;
  name: string;
  /** Who is behind it — a provider's name, or a business's kind and place. */
  byline?: string;
  /** Already formatted in the reader's locale by the page that has the DTO. */
  price?: string;
}

/**
 * Where somebody files a listing they have just saved.
 *
 * **It files; it never asks permission.** The heart already saved — that is
 * what a quick save is — so the header says so in the past tense and the only
 * button is Done. There is no Cancel, because there is nothing to cancel and
 * a Cancel would imply the save had not happened. For the same reason a tick
 * writes immediately rather than on Done: a membership that landed only on
 * Done would be lost by a reader who closed with Escape, which is not a
 * gesture that means "undo".
 *
 * **The listing is on screen.** The dialog opens from a grid of twenty-four;
 * without the photograph and the name, nothing says which one it is about.
 * The left panel's photo is square rather than 4:3 — the right column's
 * height is set by the list of lists, and 4:3 left a band of white under the
 * price that read as a panel that had failed to load.
 *
 * **Below `md` it is a bottom sheet, not this dialog restacked**, and the
 * photograph is the first thing to go: the name and the price carry the
 * identification in the subtitle instead. The `Sheet` primitive brings
 * `role="dialog"`, `aria-modal`, the focus trap and Escape with it (follow-up
 * #78); `DialogContent` has not had that pass, so the wide branch supplies
 * them itself — see `useModalFocus`.
 *
 * **Checkboxes, not radios.** Real `<input type="checkbox">` visually
 * restyled, so the browser gives keyboard operation, label association and
 * announced state for free. "Casa nova" and "Urgente" are both true about the
 * same electrician, and making somebody choose loses one of the two facts.
 *
 * **Unticking every list is the delete.** It does not look like one, so the
 * footer says what just happened in plain words rather than asking "are you
 * sure" about a thing already done.
 */
export function SaveToListDialog({
  open,
  onOpenChange,
  targetType,
  targetId,
  listing,
  savedListIds,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetType: FavouriteTargetType;
  targetId: string;
  listing: SaveToListListing;
  /**
   * The membership the heart's own save came back with, when *this* press is
   * what saved the listing.
   *
   * Absent for a press on an already-filled heart, which saved nothing and so
   * knows nothing — `useListsFor` asks in that case. Never `[]` as a stand-in
   * for "unknown": an empty array means "in no list", the one thing a filled
   * heart cannot mean.
   */
  savedListIds?: string[];
}) {
  const { t } = useTranslation("directory");
  const isMobile = useIsMobile();
  const titleId = useId();
  const nameId = useId();

  const { lists } = useMyLists();
  const { setLists } = useSetLists();
  // Asked only when the press could not answer. See `useListsFor`.
  const asked = useListsFor(targetType, targetId, { enabled: savedListIds === undefined });

  /**
   * The ticks, once the reader has touched one.
   *
   * `null` until then, so the answer on screen is whichever of the two
   * sources actually knows: the press's own, or the query's. Seeding state
   * from a prop in an effect instead would put a render between the answer
   * arriving and the ticks appearing, and every write below invalidates the
   * whole `["favourites"]` prefix — so the query answers *again* after each
   * tick, and a seeding effect would then overwrite the reader's own choice
   * with the server's older one.
   */
  const [picked, setPicked] = useState<string[] | null>(null);

  /**
   * The membership, or `undefined` while nobody yet knows it — and the
   * distinction is load-bearing, which is why there is no `?? []` on the end
   * of this line.
   *
   * `useListsFor` answers `undefined` until the round trip lands, precisely
   * because an empty array means "in no list" — the one thing a filled heart
   * cannot mean. Defaulting it here would undo that guarantee and hand every
   * reader of `selected` below a confident, wrong answer: the footer would
   * say "No longer saved" about a saved listing, and the first tick would
   * send a `setLists` that silently dropped every other list it was in.
   *
   * The window is not exotic. `useMyLists` is warm from the first open and
   * refetched by every write's prefix invalidation, while `listsFor` is
   * always cold for a newly opened target — so rows-before-membership is the
   * normal ordering from the second filled-heart press onward.
   */
  const known = picked ?? savedListIds ?? asked.listIds;
  const selected = known ?? [];
  /** Nothing may be written from a membership nobody knows yet. */
  const unknown = known === undefined;

  function choose(next: string[]) {
    setPicked(next);
    // The whole desired membership, never an add/remove pair — see `useSetLists`.
    setLists(targetType, targetId, next);
  }

  function toggle(id: string) {
    // Belt and braces: the rows are inert while the membership is unknown
    // (see `unknown` above), and a label click that got past that must not
    // write a membership built out of an empty guess.
    if (unknown) return;
    choose(selected.includes(id) ? selected.filter((held) => held !== id) : [...selected, id]);
  }

  const [query, setQuery] = useState("");
  const needle = query.trim().toLocaleLowerCase();
  const shown = needle
    ? lists.filter((list) => listDisplayName(list, t).toLocaleLowerCase().includes(needle))
    : lists;

  // The list the note names. The server puts the default list first and
  // nothing on this side re-sorts it, so straight after a quick save this is
  // the list the heart saved into — which is what the note is about.
  const savedIn = lists.find((list) => selected.includes(list.id));

  const naming = useNewList({ selected, onCreated: choose });

  const panel = useRef<HTMLDivElement>(null);
  useModalFocus(panel, open && !isMobile, () => onOpenChange(false));

  /**
   * The one line in the header, and the four things it can truthfully say.
   *
   * Ordered by what is actually known. The two grey lines never appear while
   * the membership is in flight: a header telling somebody to untick
   * everything, over a listing whose heart is filled and whose lists have not
   * arrived, is the one sentence this dialog exists not to print.
   */
  const note = asked.failed ? (
    // `failed`, not `errorCode`: a network failure carries no code at all
    // (`favouritesErrorCode` returns `undefined` for anything that is not a
    // `GraphqlError`), and that is exactly the case that would otherwise
    // leave this dialog waiting in silence for an answer that is not coming.
    <p className="mt-1.5 text-[13px] text-[var(--color-muted-foreground)]">
      {t("saveToListListsError")}
    </p>
  ) : unknown || selected.length > 0 ? (
    <p className="mt-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-[var(--color-success)]">
      <Check aria-hidden="true" strokeWidth={2.6} className="h-3.5 w-3.5" />
      {/* Which list it is in is a second fact, and it arrives second — with
          the lists on a first open, and with `favouriteListsFor` on a filled
          heart. Until then the line says only what the filled heart already
          said, which is true throughout. */}
      {savedIn ? t("saveToListSavedIn", { name: listDisplayName(savedIn, t) }) : t("favouriteSaved")}
    </p>
  ) : (
    // The same slot, so the panel does not jump a line taller the moment
    // the last tick comes off.
    <p className="mt-1.5 text-[13px] text-[var(--color-muted-foreground)]">
      {t("saveToListHowToUnsave")}
    </p>
  );

  const search = lists.length > SEARCH_VISIBLE_ABOVE && (
    <div className="mx-3 mb-2 flex items-center gap-2 rounded-[10px] border border-[var(--color-border-strong)] px-3 py-2">
      <Search aria-hidden="true" className="h-[15px] w-[15px] text-[var(--color-muted-foreground)]" />
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        aria-label={t("saveToListSearch")}
        placeholder={t("saveToListSearch")}
        className="w-full bg-transparent text-[13.5px] outline-none placeholder:text-[var(--color-muted-foreground)]"
      />
    </div>
  );

  /**
   * The field, directly under the header rather than in a second modal: a
   * modal over a modal hides the thing being saved behind the thing deciding
   * where to put it, and putting the field above the rows keeps the lists it
   * is about to join in view underneath.
   */
  const newList = naming.open && (
    <div className="px-3 pt-1 pb-2.5">
      <label htmlFor={nameId} className="mb-1.5 block text-[12.5px] font-semibold text-[var(--color-muted-foreground)]">
        {t("saveToListNameLabel")}
      </label>
      <form className="flex gap-2" onSubmit={naming.submit}>
        <input
          id={nameId}
          ref={naming.field}
          value={naming.name}
          onChange={(event) => naming.setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            // The *native* event, because both shells listen for Escape on
            // `document` and React's synthetic `stopPropagation` never
            // reaches it. Escape in a half-typed name means "drop the name",
            // not "close the dialog and lose the name and the filing with
            // it".
            event.nativeEvent.stopPropagation();
            naming.cancel();
          }}
          maxLength={FAVOURITE_LIST_NAME_MAX_LENGTH}
          className="flex-1 rounded-[10px] border-[1.5px] border-[var(--color-headline)] px-3 py-2 text-[14px] outline-none"
        />
        <button
          type="submit"
          className="rounded-[10px] bg-[var(--color-navy-surface)] px-4 text-[13.5px] font-semibold text-[var(--color-navy-on)]"
        >
          {t("saveToListNameSubmit")}
        </button>
      </form>
    </div>
  );

  const rows = (
    // `aria-busy` while the ticks are still being fetched: the rows are on
    // screen and the boxes are not yet answerable, which is exactly what that
    // attribute is for.
    <div aria-busy={asked.loading} className="min-h-0 flex-1 overflow-y-auto px-3">
      {shown.map((list) => (
        <ListRow
          key={list.id}
          list={list}
          checked={selected.includes(list.id)}
          // Inert, not merely unticked. An empty box that can be pressed
          // while the membership is in flight is a box that sends the wrong
          // membership.
          disabled={unknown}
          onToggle={() => toggle(list.id)}
        />
      ))}
      {!naming.open && (
        <button
          type="button"
          onClick={naming.start}
          // A list created in that same window would be ticked into an empty
          // membership, which is the same write with the same lists dropped.
          disabled={unknown}
          className="flex w-full items-center gap-3 rounded-[11px] px-2.5 py-2.5 text-left text-[14px] font-semibold text-[var(--color-headline)] hover:bg-[var(--color-muted)] disabled:opacity-50"
        >
          <span
            aria-hidden="true"
            className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[9px] border-[1.5px] border-dashed border-[var(--color-border-strong)]"
          >
            <Plus className="h-4 w-4 text-[var(--color-muted-foreground)]" />
          </span>
          {t("saveToListCreate")}
        </button>
      )}
    </div>
  );

  const footer = (
    <div
      className={cn(
        "flex border-t border-[var(--color-border)] px-[22px] py-3.5",
        // Stacked on the phone, because the Done button is full width there
        // and a full-width button beside a paragraph in one row pushes the
        // row past the sheet. The mockup never draws the two together — its
        // phone sheet has no unticked state — but a reader can reach it.
        isMobile ? "flex-col items-stretch gap-2.5" : "flex-row items-center gap-3",
      )}
    >
      {/* Never while the membership is unknown: `selected` is an empty array
          in that window and this sentence would be a claim about a listing
          whose lists have not arrived. */}
      {!unknown && selected.length === 0 && (
        // Plain words about a thing already done, not a confirmation. The
        // mockup's amber is the bold half's job here: amber text at 12.5px
        // fails contrast on white, so the sentence that matters is carried by
        // weight and the site's own foreground instead of by a colour nobody
        // can read.
        <p className="max-w-[38ch] text-[12.5px] leading-snug text-[var(--color-muted-foreground)]">
          <b className="font-semibold text-[var(--color-foreground)]">{t("saveToListUnsaved")}</b>{" "}
          {t("saveToListSaveAgain")}
        </p>
      )}
      <button
        type="button"
        onClick={() => onOpenChange(false)}
        className={cn(
          "rounded-full bg-[var(--color-navy-surface)] px-5.5 py-2.5 text-[14px] font-semibold text-[var(--color-navy-on)]",
          // Full width at the thumb on a phone, where the footer is a column;
          // pushed to the right of the row on a wide screen.
          isMobile ? "w-full" : "ml-auto shrink-0",
        )}
      >
        {t("saveToListDone")}
      </button>
    </div>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          labelledBy={titleId}
          className="flex max-h-[82svh] flex-col rounded-t-[20px] p-0"
        >
          <span
            aria-hidden="true"
            className="mx-auto mt-2.5 h-1 w-9 shrink-0 rounded-full bg-[var(--color-border-strong)]"
          />
          <SheetHeader className="px-4.5 pt-2 pb-3">
            <SheetTitle id={titleId} className="text-[17px] font-bold text-[var(--color-headline)]">
              {t("saveToListTitle")}
            </SheetTitle>
            {/* The photograph is gone, so the name and the price are what say
                which listing this is about. One line, clipped rather than
                wrapped: the sheet's height belongs to the lists. */}
            <p className="truncate text-[13px] text-[var(--color-muted-foreground)]">
              {[listing.name, listing.price].filter(Boolean).join(" · ")}
            </p>
            {note}
          </SheetHeader>
          {search}
          {newList}
          {rows}
          {footer}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[640px] overflow-hidden rounded-[20px] p-0">
        {/* `Dialog`/`DialogContent` draw a backdrop and a panel and nothing
            else — no role, no name, no focus trap — so this element supplies
            all three, as `detail-gallery.tsx` does for the same reason. */}
        <div
          ref={panel}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          className="grid grid-cols-[236px_minmax(0,1fr)] outline-none"
        >
          <aside className="border-r border-[var(--color-border)] p-[22px]">
            <div className="aspect-square overflow-hidden rounded-[14px] bg-[var(--color-muted)]">
              <BrandImage
                src={listing.imageUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            </div>
            <h3 className="mt-3 text-[14.5px] leading-snug font-semibold text-[var(--color-foreground)]">
              {listing.name}
            </h3>
            {listing.byline && (
              <p className="mt-[3px] text-[13px] text-[var(--color-muted-foreground)]">
                {listing.byline}
              </p>
            )}
            {listing.price && (
              <p className="mt-2 text-[15px] font-bold text-[var(--color-headline)]">
                {listing.price}
              </p>
            )}
          </aside>

          <div className="flex max-h-[70svh] min-h-0 flex-col">
            <DialogHeader className="gap-0 px-[22px] pt-5 pb-3.5">
              <h2 id={titleId} className="text-[18px] font-bold tracking-[-0.01em] text-[var(--color-headline)]">
                {t("saveToListTitle")}
              </h2>
              {note}
            </DialogHeader>
            {search}
            {newList}
            {rows}
            {footer}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * One list, as a row somebody ticks.
 *
 * A `<label>` around the whole row rather than a click handler on a div: the
 * label association is what makes the cover, the name and the count all part
 * of the checkbox's accessible name and all part of its hit target, without a
 * line of JavaScript.
 */
function ListRow({
  list,
  checked,
  disabled = false,
  onToggle,
}: {
  list: FavouriteList;
  checked: boolean;
  /** True while nobody knows the membership yet — see `unknown` in the dialog. */
  disabled?: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation("directory");

  return (
    <label
      className={cn(
        "flex items-center gap-3 rounded-[11px] px-2.5 py-2.5",
        disabled ? "cursor-default opacity-60" : "cursor-pointer hover:bg-[var(--color-muted)]",
      )}
    >
      <ListCover urls={list.coverUrls} empty={list.itemCount === 0} />
      <span className="min-w-0 flex-1">
        <b className="block truncate text-[14px] font-semibold text-[var(--color-foreground)]">
          {/* The one place a null name turns into a word. Never a literal. */}
          {listDisplayName(list, t)}
        </b>
        <span className="text-[12.5px] text-[var(--color-muted-foreground)]">
          {list.itemCount === 0 ? t("listEmpty") : t("listItemCount", { count: list.itemCount })}
        </span>
      </span>
      <Checkbox
        checked={checked}
        disabled={disabled}
        onChange={onToggle}
        className={cn(
          "h-5 w-5 rounded-[6px] border-[1.6px] border-[var(--color-border-strong)]",
          // Navy, not the ring token: the site spends its one blue in the
          // header, and filled navy is what this design already says
          // "chosen" with — the active filter pill, the current page number,
          // the verified seal, the saved heart.
          "checked:border-[var(--color-navy-surface)] checked:bg-[var(--color-navy-surface)]",
          "focus-visible:ring-[var(--color-headline)]",
        )}
      />
    </label>
  );
}

/**
 * Naming a new list, in place.
 *
 * The tick that follows is the whole point of the gesture — somebody creates
 * "Casa nova" *in order to* put this listing in it — so the new id is added
 * to the membership the moment the server hands one back. It cannot be added
 * before: `useCreateList` is deliberately not optimistic because an invented
 * row would have no id for exactly this next step to use.
 */
function useNewList({
  selected,
  onCreated,
}: {
  selected: string[];
  onCreated: (next: string[]) => void;
}) {
  const { createList, createdId } = useCreateList();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const field = useRef<HTMLInputElement>(null);

  // Read by the effect below, which must not re-run when the ticks change or
  // when the caller passes a fresh closure — it fires once per created list,
  // and the membership it needs is whatever is on screen at that moment.
  const latest = useRef(selected);
  const created = useRef(onCreated);
  useEffect(() => {
    latest.current = selected;
    created.current = onCreated;
  });

  // The field opens above the rows while the button that opened it sits under
  // them, so the cursor has to follow: a keyboard reader who pressed "Create
  // new list" is otherwise left standing where the button no longer is.
  useEffect(() => {
    if (open) field.current?.focus();
  }, [open]);

  /**
   * The ids already ticked by a created list, so a re-render — or React's
   * strict double-invoke — cannot file the same list twice. `createdId` is
   * this hook's own mutation data, so it becomes defined exactly once per
   * creation. The same guard `FavouriteButton` uses on `listIds`.
   */
  const ticked = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!createdId || createdId === ticked.current) return;
    ticked.current = createdId;
    created.current([...latest.current, createdId]);
    setOpen(false);
    setName("");
  }, [createdId]);

  return {
    open,
    name,
    setName,
    field,
    start: () => setOpen(true),
    /** Abandon the name. The field closes empty, exactly as it does on a create. */
    cancel: () => {
      setOpen(false);
      setName("");
    },
    submit: (event: { preventDefault: () => void }) => {
      event.preventDefault();
      // The server trims and bounds this at 1..60 characters and refuses
      // anything else as VALIDATION_ERROR; stopping an empty name here saves
      // a round trip whose only possible outcome is a refusal.
      const trimmed = name.trim();
      if (trimmed.length === 0) return;
      createList(trimmed);
    },
  };
}

/** Focusable descendants, in document order — what a focus trap and an initial focus both need. */
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Escape, a focus trap, and the return of focus — the three things
 * `SheetContent` already does and `DialogContent` does not.
 *
 * Written here rather than added to the kit's `Dialog` because that primitive
 * has seven other callers, each supplying its own `role="dialog"` today
 * (`detail-gallery.tsx` is the pattern), and giving it a name and a trap is a
 * change to all seven at once. This is the same effect `SheetContent` runs,
 * kept beside the one dialog that needs it until the kit has that pass.
 *
 * Escape and the focus return share one effect because they share the same
 * "who had focus before this opened" reference: capturing it in a second
 * effect would race this one's cleanup on a fast open-close.
 */
function useModalFocus(
  panel: RefObject<HTMLDivElement | null>,
  active: boolean,
  close: () => void,
) {
  // A ref, not a dependency: `close` is an inline arrow at the call site, so
  // listing it would tear the trap down and rebuild it on every render —
  // yanking focus back to the first control every time a tick changed.
  // `SheetContent` keeps its own `setOpen` identity stable for this reason.
  const closing = useRef(close);
  useEffect(() => {
    closing.current = close;
  });

  useEffect(() => {
    if (!active) return;
    const returnTo = document.activeElement as HTMLElement | null;
    // Read once, because the cleanup below needs the panel that is being torn
    // down rather than whatever the ref points at by then. It is the same
    // node throughout: the dialog is mounted only while it is open.
    const node = panel.current;

    const first = node?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? node)?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        closing.current();
        return;
      }
      if (event.key !== "Tab" || !node) return;
      const focusable = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const firstEl = focusable[0]!;
      const lastEl = focusable[focusable.length - 1]!;
      const inPanel = document.activeElement;
      // Focus is not in the panel at all — the common case after any control
      // inside it unmounts, which the "Create new list" button does the
      // moment it is pressed. Without this branch the next Tab walks into
      // the page behind a panel claiming `aria-modal`.
      if (!inPanel || !node.contains(inPanel)) {
        event.preventDefault();
        (event.shiftKey ? lastEl : firstEl).focus();
        return;
      }
      if (event.shiftKey && (inPanel === firstEl || inPanel === node)) {
        event.preventDefault();
        lastEl.focus();
      } else if (!event.shiftKey && inPanel === lastEl) {
        event.preventDefault();
        firstEl.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      // Only if focus is still inside the panel being torn down, or nowhere:
      // a close that already moved focus somewhere deliberate must not have
      // it yanked back.
      if (!returnTo) return;
      if (document.activeElement === document.body || node?.contains(document.activeElement)) {
        returnTo.focus();
      }
    };
  }, [active, panel]);
}
