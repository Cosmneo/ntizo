import { useTranslation } from "react-i18next";

/** How many tiles the grid shows before the rest become a count. */
const VISIBLE = 5;

/**
 * The business's own photographs of its work.
 *
 * Renders nothing when there are none, rather than an empty frame: most
 * businesses have uploaded none yet, and a labelled box with nothing in it
 * reads as a page that failed to load rather than as a business that has not
 * got round to it.
 *
 * The overflow is a count, not a carousel. A gallery a reader has to operate to
 * learn how many pictures there are is a control spent on a number; "+8 more"
 * says it in the space of one tile, and the pictures themselves belong on a
 * page that is about them rather than in a strip beside the services.
 *
 * `alt=""`. These are decorative in the strict sense — the work is described by
 * the services below, and "photograph 3 of 12" is not a description of
 * anything. A screen reader gets the labelled section and skips the tiles.
 */
export function ProviderPortfolio({
  photoUrls,
  providerName,
}: {
  photoUrls: readonly string[];
  providerName: string;
}) {
  const { t } = useTranslation("directory");
  if (photoUrls.length === 0) return null;

  const shown = photoUrls.slice(0, VISIBLE);
  const rest = photoUrls.length - shown.length;

  return (
    <section className="mt-12" aria-label={t("portfolioTitle", { name: providerName })}>
      <h2 className="type-h2">{t("portfolioTitle", { name: providerName })}</h2>
      <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {shown.map((url) => (
          <li
            key={url}
            className="aspect-[4/3] overflow-hidden rounded-[var(--radius-card-sm)] border border-[var(--color-border)] bg-[var(--color-muted)]"
          >
            <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
          </li>
        ))}
        {rest > 0 && (
          <li className="grid aspect-[4/3] place-items-center rounded-[var(--radius-card-sm)] border border-dashed border-[var(--color-border)] bg-[var(--color-muted)]">
            <span className="type-body-medium font-semibold text-[var(--color-muted-foreground)]">
              {t("portfolioMore", { count: rest })}
            </span>
          </li>
        )}
      </ul>
    </section>
  );
}
