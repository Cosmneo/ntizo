import { useTranslation } from "react-i18next";
import { useSearch } from "@tanstack/react-router";
import { Search, Store } from "lucide-react";
import { useDirectory } from "@/features/directory/viewmodel/use-directory";
import { EmptyCard } from "@/shared/components/empty-card";
import { ServiceSearch } from "@/shared/components/service-search";
import { SiteHeader } from "@/shared/components/site-header";

/**
 * The public provider directory.
 *
 * `useSuspenseQuery`, not `useQuery`: this page is server-rendered so a crawler
 * finds the listings in the HTML. A plain `useQuery` would render its loading
 * state on the server and ship a page with no content in it — which is the one
 * outcome a page built to rank must not have.
 */
export function DirectoryPage() {
  const { t } = useTranslation("directory");
  // `strict: false` so this component stays usable outside its own route (and
  // testable without one); the route validates `q` before it ever gets here.
  const { q = "" } = useSearch({ strict: false }) as { q?: string };
  // `items` are the rows this page shows; `total` is how many matched. The
  // results line states the second — with a page size of 20, counting the rows
  // told somebody with 40 matches that they had 20.
  const { items: providers, total } = useDirectory(q);

  return (
    <>
      <SiteHeader current="providers" />
      <main className="page-shell py-12">
        <h1 className="text-3xl font-semibold">{t("title")}</h1>
        <p className="mt-2 text-[var(--color-muted-foreground)]">
          {t("subtitle")}
        </p>

        <ServiceSearch initialValue={q} className="mt-8 max-w-2xl" />

        {providers.length === 0 ? (
          // Two different empty states. "Nothing matched X" tells the user to
          // try another word; the generic one would leave them thinking the
          // whole directory is empty — so only the generic one carries the
          // brand mark, because only it is describing an actually empty list.
          q ? (
            <EmptyCard
              className="mt-6"
              icon={Search}
              title={t("noResultsTitle")}
              body={t("noResultsFor", { query: q })}
            />
          ) : (
            <EmptyCard
              className="mt-6"
              badge={Store}
              title={t("emptyTitle")}
              body={t("empty")}
            />
          )
        ) : (
          <>
            {q ? (
              <p className="mt-8 text-sm text-[var(--color-muted-foreground)]">
                {t("resultsFor", { count: total, query: q })}
              </p>
            ) : null}
            <ul className="mt-6 grid gap-4 sm:grid-cols-2">
              {providers.map((p) => (
                <li
                  key={p.id}
                  className="rounded-lg border border-[var(--color-border)] p-5"
                >
                  <h2 className="text-lg font-medium">{p.name}</h2>
                  <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
                    {t(
                      p.type === "organization"
                        ? "typeOrganization"
                        : "typeIndividual",
                    )}
                    {p.city ? ` · ${p.city}` : ""}
                    {p.country ? `, ${p.country}` : ""}
                  </p>
                  {p.description ? (
                    <p className="mt-3 text-sm">{p.description}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
    </>
  );
}
