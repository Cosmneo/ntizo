/**
 * The row of labelled facts under a detail page's title — Category / Works /
 * Services / On Ntizo since for a provider, Duration / Works / Pricing /
 * Category for a service.
 *
 * A fact whose value is empty is dropped rather than rendered as a labelled
 * blank. A column that reads "On Ntizo since" with nothing under it looks
 * like the page failed to load the field, not like a provider who simply has
 * not filled that in — the same call `ProviderPortfolio` and `DetailGallery`
 * make about a business with no photos yet: absence of the row, not an empty
 * row, is what "nothing here" should look like. When every fact is empty the
 * whole component renders nothing, for the same reason.
 *
 * Markup is a real `<dl>` with a `<dt>`/`<dd>` pair per fact, not a row of
 * `<div>`s, so each value is paired with its own label for assistive tech —
 * and so callers can find the row by `getAllByRole("term")` even when a
 * fact's label (e.g. "Services") repeats as a section heading elsewhere on
 * the page and a text query would match both.
 */
export function DetailFacts({ facts }: { facts: readonly { label: string; value: string }[] }) {
  const shown = facts.filter((fact) => fact.value.trim() !== "");
  if (shown.length === 0) return null;

  return (
    <dl className="mt-7 grid grid-cols-2 gap-6 border-y border-[var(--color-border)] py-5 sm:grid-cols-4">
      {shown.map((fact) => (
        <div key={fact.label}>
          <dt className="type-caption text-[var(--color-muted-foreground)] uppercase tracking-[0.09em]">
            {fact.label}
          </dt>
          <dd className="type-body mt-1.5 font-semibold">{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}
