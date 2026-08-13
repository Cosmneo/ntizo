import { useTranslation } from "react-i18next";
import { Link, useSearch } from "@tanstack/react-router";
import { SiteHeader } from "@/shared/components/site-header";
import { useBrowseServices } from "@/features/directory/services/viewmodel/use-browse-services";
import { BrowseServiceCard } from "@/features/directory/services/ui/browse-service-card";
import { BROWSE_PAGE_SIZE } from "@/features/directory/services/domain/types";

/**
 * Every published service on the platform.
 *
 * The page a customer arrives on wanting a haircut rather than wanting a
 * particular barber — which is the commoner arrival, and why this sits before
 * the provider directory in the nav.
 *
 * Paging is `nextOffset` from the server and never `items.length`. A row
 * dropped for being unpublished, for its provider going inactive, or for
 * having no readable name still occupied a position in the underlying order;
 * advancing by the shorter number would fetch it again forever. The
 * projection's own comment says so, and this is the caller it is warning.
 *
 * Offset lives in the URL, like the directory's `?q=`: a results page you
 * cannot link to or reload is not a results page, and it is what carries the
 * value into the loader so page two is server-rendered like page one.
 */
export function ServicesBrowsePage() {
  const { t, i18n } = useTranslation("directory");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  // `strict: false` so this component stays usable outside its own route and
  // testable without one; the route validates before it reaches here.
  const { category, offset = 0 } = useSearch({ strict: false }) as {
    category?: string;
    offset?: number;
  };
  const page = useBrowseServices(category, offset);

  return (
    <>
      <SiteHeader current="services" />
      <main className="page-shell py-12">
        <h1 className="text-3xl font-semibold">{t("servicesTitle")}</h1>
        <p className="mt-2 text-[var(--color-muted-foreground)]">{t("servicesSubtitle")}</p>

        {page.items.length === 0 ? (
          <p className="mt-10 text-[var(--color-muted-foreground)]">{t("servicesEmpty")}</p>
        ) : (
          <>
            <ul className="mt-8 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {page.items.map((service) => (
                <BrowseServiceCard key={service.id} service={service} locale={locale} />
              ))}
            </ul>

            {/* Links, not buttons: the same reason the cards are. Back appears
                only off the first page, and forward only when the server says
                there is one — `nextOffset` is null at the end, which is a
                fact the client has no other way to know. */}
            <nav className="mt-10 flex items-center justify-between gap-3">
              {offset > 0 ? (
                <Link
                  to="/services"
                  search={{
                    ...(category ? { category } : {}),
                    ...(offset - BROWSE_PAGE_SIZE > 0
                      ? { offset: offset - BROWSE_PAGE_SIZE }
                      : {}),
                  }}
                  className="type-body font-semibold text-[var(--color-primary)] hover:underline"
                >
                  {t("servicesPrevious")}
                </Link>
              ) : (
                <span />
              )}
              {page.nextOffset !== null ? (
                <Link
                  to="/services"
                  search={{
                    ...(category ? { category } : {}),
                    offset: page.nextOffset,
                  }}
                  className="type-body font-semibold text-[var(--color-primary)] hover:underline"
                >
                  {t("servicesNext")}
                </Link>
              ) : (
                <span />
              )}
            </nav>
          </>
        )}
      </main>
    </>
  );
}
