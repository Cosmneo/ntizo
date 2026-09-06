import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import { CitySelect, Sheet, SheetContent, SheetHeader, SheetTitle } from "@ntizo/frontend-ui";

/**
 * The one search, asked from the header.
 *
 * Two fields and a button, as the browse pages' hero card drew them before
 * this — `/services` and `/providers` each carried an identical private
 * `HeroSearch`, differing only in which noun they searched for. This is that
 * component, moved here once and restyled as a pill: same drafts, same
 * effect, same escape hatch, same phone sheet, wearing the header's shape
 * instead of the hero's.
 *
 * **One form, one submission.** Both fields are drafts until the button is
 * pressed, and `onApply` is called from the drafts, not from whatever `term`
 * and `city` were passed in as. Composing from the props instead threw away a
 * typed term the moment the other field was touched: type "corte", pick
 * Beira, and the caller got `city: "Beira"` with the word gone. It is a real
 * `<form>` with a real `type="submit"`, so Enter in the text field works
 * because browsers make it work, and the pill is not the one control on a
 * page of links that needs JavaScript to do anything.
 *
 * **No router hook lives here.** `onApply` is given the trimmed drafts and
 * decides what to do with them — write a URL, in every caller today — because
 * a pill that owns navigation could only ever be dropped onto a page that
 * wants exactly its `/services` or `/providers` shape. Passing the site's
 * only blue button back through a callback keeps this usable from a header
 * that has no opinion about routes.
 *
 * Each resting field is a `<button type="button">` showing its label above
 * its value; picking one swaps a real control into the same slot so nothing
 * else on the pill moves. The city field opens a `CitySelect` — the same
 * combobox `AddressesPage` and provider `Settings` already use — rather than
 * a raw `<select>`: a native select carries no styling into its own popup and
 * needs two clicks, because focusing a select and opening its list are two
 * different things. `CitySelect` is focused as it mounts, and because *its
 * own* focus handler is what opens its list, the swap that reveals it is the
 * one click that opens it too. `CitySelect` does no filtering of its own —
 * narrowing `cities` as the draft is typed is this component's job, the same
 * way the two `HeroSearch`es always did it.
 *
 * Escape on the *term* field closes it and puts focus back on the button
 * that opened it, via `queueMicrotask` — the button does not exist yet at the
 * moment `close()` runs, only after the swap that follows it. A control that
 * unmounts under the cursor and drops focus onto `<body>` sends a keyboard
 * user back to the top of the document. The city field has no such
 * hand-rolled handler: `CitySelect` already closes its own list on Escape,
 * and a second handler on top of a control that manages its own open state
 * would fight it rather than help it.
 *
 * **Not drawn at all below `md`.** A 600px pill in 360px is a control nobody
 * completes, so it hides itself there and a one-row trigger takes its place —
 * tapping it opens a sheet holding the same two fields, full size. Both write
 * through the same `apply`, because they are the same search asked at two
 * widths and not two searches. The trigger's accessible name comes from
 * `searchPillOpen` rather than the label-then-value text it draws, on
 * purpose: that text also contains the term label at rest, which is the same
 * word the desktop button beside it (once both are in the DOM, as they are
 * for anyone not filtering by CSS) already owns.
 */
export function SearchPill({
  termLabel,
  termPlaceholder,
  cityLabel,
  cityPlaceholder,
  term: termProp,
  city: cityProp,
  cities,
  onApply,
}: {
  termLabel: string;
  termPlaceholder: string;
  cityLabel: string;
  cityPlaceholder: string;
  term: string;
  city: string;
  cities: string[];
  onApply: (next: { term: string; city: string }) => void;
}) {
  const { t } = useTranslation("directory");
  const cityFieldId = useId();
  const sheetTitleId = useId();
  const [open, setOpen] = useState<"q" | "city" | null>(null);
  // The phone's sheet, which is the whole pill at that width. Its own state
  // rather than a third value of `open`: the two never overlap, because one
  // is drawn only below `md` and the other only from `md` up.
  const [sheet, setSheet] = useState(false);
  const [term, setTerm] = useState(termProp);
  const [city, setCity] = useState(cityProp);
  const termButton = useRef<HTMLButtonElement>(null);
  const cityButton = useRef<HTMLButtonElement>(null);

  // `CitySelect` does no filtering of its own — it only shows what it is
  // given — so narrowing the offered set as the reader types is this
  // component's job, not the combobox's.
  const cityOptions = cities.filter((c) =>
    c.toLowerCase().includes(city.trim().toLowerCase()),
  );

  // The caller is the authority. Its `term`/`city` changing underneath (the
  // reader went back, or picked a chip elsewhere on the page) has to put that
  // search back into both fields, or they would go on offering a question the
  // page no longer answers.
  useEffect(() => {
    setTerm(termProp);
    setCity(cityProp);
    setOpen(null);
  }, [termProp, cityProp]);

  /**
   * Closing hands focus back to the button that opened the field, because the
   * control the reader is standing on is about to stop existing.
   */
  const close = () => {
    const back = open === "q" ? termButton : cityButton;
    setOpen(null);
    // After the swap, not before: the button does not exist yet at this point.
    queueMicrotask(() => back.current?.focus());
  };

  /**
   * The drafts, handed to the caller.
   *
   * Shared by the pill and the sheet, which are the same search asked at two
   * widths — two copies of this is how one of them starts dropping a
   * parameter the other keeps.
   */
  const apply = () => {
    setOpen(null);
    setSheet(false);
    onApply({ term: term.trim(), city: city.trim() });
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    apply();
  };

  const onEscape = (event: { key: string; preventDefault: () => void }) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  };

  return (
    <>
      <form
        role="search"
        onSubmit={submit}
        className="hidden h-[52px] w-[600px] items-center rounded-full border border-[var(--color-border)] bg-[var(--color-background)] py-0 pr-1.5 pl-1 shadow-[0_1px_2px_rgba(0,36,76,.04),0_6px_18px_-10px_rgba(0,36,76,.25)] transition-shadow hover:shadow-[0_1px_2px_rgba(0,36,76,.06),0_8px_22px_-10px_rgba(0,36,76,.35)] md:flex"
      >
        {open === "q" ? (
          <input
            type="search"
            autoFocus
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={onEscape}
            aria-label={termLabel}
            placeholder={termPlaceholder}
            className="type-body h-full min-w-0 flex-1 rounded-full bg-transparent px-4 text-[var(--color-foreground)] outline-none"
          />
        ) : (
          <button
            type="button"
            ref={termButton}
            onClick={() => setOpen("q")}
            className="grid h-full min-w-0 flex-1 content-center rounded-full px-4 text-left hover:bg-[var(--color-surface-raised)]"
          >
            <span className="type-caption font-semibold text-[var(--color-headline)]">
              {termLabel}
            </span>
            <span className="type-body-medium truncate text-[var(--color-muted-foreground)]">
              {term || termPlaceholder}
            </span>
          </button>
        )}

        <span aria-hidden="true" className="h-7 w-px shrink-0 bg-[var(--color-border)]" />

        {open === "city" ? (
          <div className="flex min-w-0 flex-1 items-center">
            {/* Visually hidden: the button it replaces carries its own label
                above the value, and putting a second one here would be the
                pill growing a line it never had at rest. */}
            <label htmlFor={cityFieldId} className="sr-only">
              {cityLabel}
            </label>
            <CitySelect
              id={cityFieldId}
              value={city}
              onChange={setCity}
              cities={cityOptions}
              autoFocus
              placeholder={cityPlaceholder}
              toggleLabel={t("searchFieldCityToggle")}
              noResultsText={t("searchFieldCityNoResults")}
              className="w-full"
            />
          </div>
        ) : (
          <button
            type="button"
            ref={cityButton}
            onClick={() => setOpen("city")}
            className="grid h-full min-w-0 flex-1 content-center rounded-full px-4 text-left hover:bg-[var(--color-surface-raised)]"
          >
            <span className="type-caption font-semibold text-[var(--color-headline)]">
              {cityLabel}
            </span>
            <span className="type-body-medium truncate text-[var(--color-muted-foreground)]">
              {city || cityPlaceholder}
            </span>
          </button>
        )}

        {/* The one blue on the pill — everything else here is headline,
            foreground, muted-foreground and the hairline border. */}
        <button
          type="submit"
          aria-label={t("searchPillSubmit")}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--color-primary)] text-[var(--color-primary-foreground)] transition-colors hover:bg-[var(--color-primary-deep)]"
        >
          <Search className="h-4 w-4" aria-hidden="true" />
        </button>
      </form>

      <button
        type="button"
        onClick={() => setSheet(true)}
        aria-label={t("searchPillOpen")}
        className="flex w-full items-center gap-3 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-background)] p-3.5 text-left shadow-[var(--shadow-float)] md:hidden"
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-[var(--color-muted)] text-[var(--color-primary)]">
          <Search className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="grid min-w-0">
          <b className="type-body-medium truncate font-semibold text-[var(--color-headline)]">
            {term || termPlaceholder}
          </b>
          <span className="type-caption truncate text-[var(--color-muted-foreground)]">
            {city || cityPlaceholder}
          </span>
        </span>
        <span
          aria-hidden="true"
          className="ml-auto grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
        >
          <Search className="h-[15px] w-[15px]" />
        </span>
      </button>

      {/* Real controls, both of them, rather than the pill's click-to-open
          fields: the sheet is the whole screen, so there is nothing to save
          by collapsing them and nothing left on the pill to shift when they
          expand. */}
      <Sheet open={sheet} onOpenChange={setSheet}>
        <SheetContent
          side="bottom"
          labelledBy={sheetTitleId}
          className="max-h-[85svh] overflow-y-auto rounded-t-[var(--radius-card)] p-5"
        >
          <div>
            <SheetHeader>
              <SheetTitle id={sheetTitleId}>{t("mobileSearchTitle")}</SheetTitle>
            </SheetHeader>

            {/* A real form with a real submit, so the on-screen keyboard
                offers "go" from the text field and Enter reaches the button —
                the same reason the desktop form is one. */}
            <form
              onSubmit={(event) => {
                event.preventDefault();
                apply();
              }}
              className="mt-4 grid gap-2.5"
            >
              <label className="grid gap-1.5">
                <span className="type-caption font-semibold">{termLabel}</span>
                <input
                  type="search"
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  placeholder={termPlaceholder}
                  className="type-body w-full min-w-0 rounded-[var(--radius-card-sm)] border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3 outline-none focus:border-[var(--color-primary)]"
                />
              </label>

              <label className="grid gap-1.5">
                <span className="type-caption font-semibold">{cityLabel}</span>
                <CitySelect
                  value={city}
                  onChange={setCity}
                  cities={cityOptions}
                  placeholder={cityPlaceholder}
                  toggleLabel={t("searchFieldCityToggle")}
                  noResultsText={t("searchFieldCityNoResults")}
                />
              </label>

              <button
                type="submit"
                className="font-rounded mt-1 inline-flex w-full items-center justify-center gap-2 rounded-[var(--radius-card-sm)] bg-[var(--color-primary)] px-4 py-3.5 text-[15px] font-semibold text-[var(--color-primary-foreground)] transition-colors hover:bg-[var(--color-primary-deep)]"
              >
                {t("mobileSearchApply")}
              </button>
            </form>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
