import { useTranslation } from "react-i18next";
import { useDirectory } from "@/features/directory/viewmodel/use-directory";

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
  const providers = useDirectory();

  return (
    <main className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="text-3xl font-semibold">{t("title")}</h1>
      <p className="mt-2 text-[var(--color-muted-foreground)]">{t("subtitle")}</p>

      {providers.length === 0 ? (
        <p className="mt-10 text-[var(--color-muted-foreground)]">{t("empty")}</p>
      ) : (
        <ul className="mt-10 grid gap-4 sm:grid-cols-2">
          {providers.map((p) => (
            <li key={p.id} className="rounded-lg border border-[var(--color-border)] p-5">
              <h2 className="text-lg font-medium">{p.name}</h2>
              <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
                {t(p.type === "organization" ? "typeOrganization" : "typeIndividual")}
                {p.city ? ` · ${p.city}` : ""}
                {p.country ? `, ${p.country}` : ""}
              </p>
              {p.description ? <p className="mt-3 text-sm">{p.description}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
