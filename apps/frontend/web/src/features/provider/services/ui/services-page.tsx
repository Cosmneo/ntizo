import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "@tanstack/react-router";
import { MoreHorizontal, Plus } from "lucide-react";
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@ntizo/frontend-ui";
import { CollectionCard } from "@/shared/components/collection-card";
import { initialsFrom } from "@/shared/lib/initials";
import { usePageAction, usePageHeader } from "@/shared/lib/page-header";
import { useActiveProvider } from "@/features/provider/viewmodel/use-active-provider";
import { useServices } from "../viewmodel/use-services";
import {
  formatOptionPrice,
  ownerName,
  priceCell,
  translatedCount,
  STATUS_TONE,
  TOTAL_LOCALES,
  type ProviderService,
} from "../domain/types";

/**
 * A provider's own catalogue: what they sell, in what languages, and whether
 * customers can see it yet.
 *
 * The same card as every other list in the app. What earns this screen its
 * own column is the language count — a service reads as finished from
 * whichever language its provider happens to be reading in, and "2/8" is the
 * only thing on the row that says otherwise.
 */
export function ServicesPage() {
  const { t, i18n } = useTranslation("provider");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const { activeProvider } = useActiveProvider();
  const query = useServices(activeProvider?.id);
  const navigate = useNavigate();

  const [search, setSearch] = useState("");

  usePageHeader(t("nav.services"), activeProvider?.name);
  // `null` while the workspace is still loading — without that guard, a
  // click during that window would navigate with `slug: undefined`. Depends
  // on the slug (not the whole `activeProvider` object, which is a fresh
  // reference on every render) so switching workspace re-registers the
  // button pointing at the new one.
  usePageAction(
    activeProvider ? (
      <Button
        size="sm"
        onClick={() =>
          void navigate({
            to: "/provider/$slug/services/$serviceId",
            params: { slug: activeProvider.slug, serviceId: "new" },
          })
        }
      >
        <Plus className="h-4 w-4" />
        <span className="hidden sm:inline">{t("serviceNew")}</span>
      </Button>
    ) : null,
    [activeProvider?.slug],
  );

  const rows = useMemo(() => query.data ?? [], [query.data]);

  // No server-side search on this query (it takes only providerId and an
  // optional status) — a provider's own catalogue is small enough that
  // filtering the already-fetched list is simpler than adding a param the
  // backend would have to support for one screen.
  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (service) =>
        ownerName(service, locale).toLowerCase().includes(needle) ||
        service.categoryCode.toLowerCase().includes(needle),
    );
  }, [rows, search, locale]);

  if (!activeProvider) return null;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      {query.error && (
        <p className="type-body text-[var(--color-destructive)]">
          {t("servicesError")}
        </p>
      )}

      <CollectionCard
        title={t("servicesTitle")}
        shown={visible.length}
        total={rows.length}
        loading={query.isLoading}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={t("servicesSearchPlaceholder")}
        columns={[
          { key: "service", label: t("servicesService"), className: "pl-5" },
          { key: "price", label: t("servicesPrice"), skeletonWidth: "w-20" },
          {
            key: "languages",
            label: t("servicesLanguages"),
            skeletonWidth: "w-12",
            skeletonShape: "badge",
          },
          {
            key: "status",
            label: t("servicesStatusLabel"),
            skeletonWidth: "w-20",
            skeletonShape: "badge",
          },
          {
            key: "actions",
            label: t("servicesActions"),
            align: "right",
            className: "pr-5",
          },
        ]}
        emptyText={t("servicesEmpty")}
        noMatchesText={t("servicesNoMatches")}
        filtered={search.trim() !== ""}
        // No `reorder`: there is no mutation to set the display order of a
        // provider's own service list (unlike its options, which have
        // `service.options.reorder`) — only sorting/filtering, nothing to drag.
        rows={visible.map((service) => {
          const translated = translatedCount(service);
          const cell = priceCell(service);
          return {
            key: service.id,
            primary: <ServiceCell service={service} slug={activeProvider.slug} locale={locale} />,
            cells: {
              price:
                cell.kind === "priced" ? (
                  formatOptionPrice(cell.option, locale)
                ) : (
                  <span className="text-[var(--color-muted-foreground)]">
                    {t(cell.kind === "quote" ? "servicesPriceOnQuote" : "servicesPriceNone")}
                  </span>
                ),
              languages: (
                // One tone in every state, unlike the admin category list's
                // amber-until-complete: a category is platform content an
                // administrator should be nudged to finish, but a provider's
                // own service is exactly what the spec says must carry no
                // friction over which languages it has — an amber badge here
                // would be the reprimand the spec forbids, just spelled as a
                // colour instead of a sentence. The count is a fact about the
                // service, not work outstanding, so it reads the same at 1/8
                // and 8/8.
                <Badge tone="neutral">
                  {translated}/{TOTAL_LOCALES}
                </Badge>
              ),
              status: (
                <Badge tone={STATUS_TONE[service.status]}>
                  {t(`servicesStatus.${service.status}`)}
                </Badge>
              ),
            },
            actions: (
              <RowActions
                onEdit={() =>
                  void navigate({
                    to: "/provider/$slug/services/$serviceId",
                    params: { slug: activeProvider.slug, serviceId: service.id },
                  })
                }
              />
            ),
          };
        })}
      />
    </div>
  );
}

/** The image if there is one, the monogram if not, and the name beside it — the name a link to the editor page. */
function ServiceCell({
  service,
  slug,
  locale,
}: {
  service: ProviderService;
  slug: string;
  locale: string;
}) {
  const name = ownerName(service, locale);
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-9 w-12 shrink-0 place-items-center overflow-hidden rounded-[var(--radius-card-sm)] bg-[var(--color-muted)]">
        {service.imageUrls[0] ? (
          <img
            src={service.imageUrls[0]}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="type-caption font-semibold text-[var(--color-muted-foreground)]">
            {initialsFrom(name)}
          </span>
        )}
      </div>
      <div className="min-w-0">
        <Link
          to="/provider/$slug/services/$serviceId"
          params={{ slug, serviceId: service.id }}
          className="type-body-medium block truncate font-semibold hover:underline"
        >
          {name}
        </Link>
        <p className="type-caption truncate text-[var(--color-muted-foreground)]">
          {service.categoryCode}
        </p>
      </div>
    </div>
  );
}

/**
 * Edit only — no move-up/move-down. There is no mutation that orders a
 * provider's services against one another (only within one service's
 * options), so unlike the admin category list's menu this one has nothing
 * to reorder.
 */
function RowActions({ onEdit }: { onEdit: () => void }) {
  const { t } = useTranslation("provider");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <button
          type="button"
          aria-label={t("servicesActions")}
          className="ml-auto grid h-8 w-8 place-items-center rounded-full text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onEdit}>{t("serviceEdit")}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
