import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { MapPin } from "lucide-react";
import { cn } from "@ntizo/frontend-ui";

/**
 * The four places a service can happen.
 *
 * Spelled here rather than read from the server: they are a closed set the
 * database's own CHECK enforces, and a filter offering whatever happened to
 * be in the data would quietly lose an option the day nobody had chosen it
 * yet.
 */
const LOCATION_TYPES = ["remote", "at_provider", "at_customer", "flexible"] as const;

/**
 * The browse's sidebar.
 *
 * Links, not form controls: a filtered list is a URL somebody can send, and
 * the back button should undo a filter. That also keeps the whole sidebar
 * usable before any JavaScript has run, which matters on a page built to be
 * crawled.
 *
 * Only the filters this data can actually answer. Price is absent on purpose
 * — the card shows the provider's chosen default option, not the cheapest, so
 * "under 500" would hide services that have a 300 option. The filter and the
 * "from" label are one decision, and it has not been made.
 */
export function BrowseFilters({
  category,
  locationType,
}: {
  category: string | undefined;
  locationType: string | undefined;
}) {
  const { t } = useTranslation("directory");

  return (
    <aside className="grid content-start gap-5 lg:sticky lg:top-4">
      <h2 className="type-body-medium font-semibold">{t("filtersTitle")}</h2>

      <section className="grid gap-2.5">
        <h3 className="type-caption inline-flex items-center gap-1.5 font-semibold text-[var(--color-muted-foreground)]">
          <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
          {t("filterWhere")}
        </h3>
        <div className="flex flex-wrap gap-2">
          {LOCATION_TYPES.map((value) => {
            const active = locationType === value;
            return (
              <Link
                key={value}
                to="/services"
                // Clicking the active one clears it: a filter you set by
                // clicking should come off the same way, without hunting for
                // a separate "clear" the sidebar would otherwise need.
                search={{
                  ...(category ? { category } : {}),
                  ...(active ? {} : { locationType: value }),
                }}
                className={cn(
                  "type-caption rounded-full border px-3 py-1.5 transition-colors",
                  active
                    ? "border-[var(--color-primary)] bg-[color-mix(in_srgb,var(--color-primary)_8%,transparent)] font-semibold text-[var(--color-primary)]"
                    : "border-[var(--color-border)] hover:border-[var(--color-muted-foreground)]",
                )}
              >
                {t(`filterWhereOption.${value}`)}
              </Link>
            );
          })}
        </div>
      </section>
    </aside>
  );
}
