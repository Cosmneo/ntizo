import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Search, X } from "lucide-react";
import {
  directorySearch,
  type DirectorySearch,
} from "@/features/directory/domain/directory-search";

/** The same ceiling the backend's `search` field carries. A search box is a search box. */
const MAX_SEARCH_LENGTH = 100;

/**
 * The directory's search box — the sibling of the services browse's own.
 *
 * The one control on this page that cannot be a link: a link needs its
 * destination before the click, and this one is whatever the reader types. So
 * it is a real form, and submitting it navigates — which keeps the rest of the
 * page's contract intact. The term ends up in the URL, so a search is still
 * something you can send to somebody, reload, and undo with the back button.
 *
 * It searches on submit, not on every keystroke. This page is server-rendered
 * through `useSuspenseQuery`; a query per keystroke would suspend the whole
 * grid each time and fire a request for every prefix of the word — and the
 * search is an unindexed scan, so those are the expensive kind.
 *
 * The typed text lives in local state while the URL holds the submitted term.
 * They are two different things — what you are typing and what you searched —
 * and the effect below resyncs them when the URL changes underneath, which is
 * what the back button does.
 */
export function DirectorySearchBox({ current }: { current: DirectorySearch }) {
  const { t } = useTranslation("directory");
  const navigate = useNavigate();
  const submitted = current.q ?? "";
  const [term, setTerm] = useState(submitted);

  // The URL is the authority. Going back to a previous search has to put that
  // search back in the box, or the box would go on showing a term the results
  // no longer answer.
  useEffect(() => setTerm(submitted), [submitted]);

  const go = (q: string) =>
    void navigate({ to: "/providers", search: directorySearch(current, { q, offset: undefined }) });

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        go(term.trim());
      }}
      className="relative"
    >
      <Search
        className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--color-muted-foreground)]"
        aria-hidden="true"
      />
      <input
        type="search"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        maxLength={MAX_SEARCH_LENGTH}
        placeholder={t("providerSearchPlaceholder")}
        aria-label={t("searchSubmit")}
        // `pr-10` leaves room for the clear button so a long term does not run
        // underneath it.
        className="type-body w-full rounded-full border border-[var(--color-border)] bg-[var(--color-background)] py-2 pr-10 pl-9 outline-none focus-visible:border-[var(--color-primary)]"
      />
      {/* Clearing is its own button rather than only emptying the field: an
          empty box the reader never submitted still shows the old results, and
          the mismatch reads as the search being broken. */}
      {submitted ? (
        <button
          type="button"
          onClick={() => {
            setTerm("");
            go("");
          }}
          aria-label={t("searchClear")}
          className="absolute top-1/2 right-2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : null}
    </form>
  );
}
