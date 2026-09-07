import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Activity } from "lucide-react";
import type { ActivityType } from "@ntizo/shared";
import type { PlatformActivityEntryDTO } from "@ntizo/shared/read-models";
import { Avatar, AvatarFallback, Badge, Button } from "@ntizo/frontend-ui";
import { CollectionCard } from "@/shared/components/collection-card";
import { initialsFrom } from "@/shared/lib/initials";
import { usePageHeader } from "@/shared/lib/page-header";
import { activityTypeKey } from "../domain/types";
import { describeActivity } from "../viewmodel/describe-activity";
import { usePlatformActivity } from "../viewmodel/use-activity";
import { AdminActivityFilterSheet } from "./admin-activity-filters";

/**
 * What has happened on the platform: everybody's activity, newest first,
 * with who did each thing.
 *
 * The same card, search box and filter panel as every other admin list —
 * not the `ActivityList` the customer's and the workspace's feeds draw,
 * because those are one person's or one workspace's own history and this is
 * an audit trail across accounts, which is a table with a "who" column
 * rather than a feed. Read through `activityAll`, the admin-only field this
 * page used to be waiting on (follow-up #55); the sentence for each row comes
 * from `describeActivity` against this namespace's own `activityType.*`
 * keys, the same renderer the customer's feed uses.
 */
export function AdminActivityPage() {
  const { t, i18n } = useTranslation("admin");
  const locale = i18n.resolvedLanguage ?? i18n.language;

  const [type, setType] = useState<ActivityType | undefined>(undefined);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { entries, loading, failed, hasMore, loadMore } = usePlatformActivity({
    ...(type ? { type } : {}),
    ...(search.trim() ? { search: search.trim() } : {}),
  });

  usePageHeader(t("activityTitle"), t("activityHint"));

  const when = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      {failed && (
        <p role="alert" className="type-body text-[var(--color-destructive)]">
          {t("activityError")}
        </p>
      )}

      <CollectionCard
        title={t("activityTitle")}
        shown={entries.length}
        total={entries.length}
        // `activityAll` is cursor-paged and never returns a count: once
        // another page exists, `entries.length` is only how many are loaded
        // so far, and the card says "N shown" rather than claim a whole.
        totalUnknown={hasMore}
        loading={loading}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={t("activitySearchPlaceholder")}
        onOpenFilters={() => setFiltersOpen(true)}
        activeFilterCount={type ? 1 : 0}
        columns={[
          { key: "who", label: t("activityWho"), className: "pl-5" },
          { key: "what", label: t("activityWhat"), skeletonWidth: "w-48" },
          { key: "kind", label: t("activityTypeLabel"), skeletonWidth: "w-28", skeletonShape: "badge" },
          { key: "when", label: t("activityWhen"), align: "right", className: "pr-5", skeletonWidth: "w-32" },
        ]}
        emptyText={t("activityEmpty")}
        emptyTitle={t("activityEmptyTitle")}
        emptyBadge={Activity}
        noMatchesText={t("activityNoMatches")}
        noMatchesTitle={t("activityNoMatchesTitle")}
        filtered={type !== undefined || search.trim() !== ""}
        rows={entries.map((entry) => ({
          key: entry.id,
          primary: <Actor entry={entry} />,
          cells: {
            what: <span className="block max-w-[40ch] truncate">{describeActivity(t, entry)}</span>,
            kind: <Badge tone="info">{t(`activityKind.${activityTypeKey(entry.type)}`)}</Badge>,
            when: (
              <span className="tabular-nums text-[var(--color-muted-foreground)]">
                {when.format(new Date(entry.occurredAt))}
              </span>
            ),
          },
        }))}
      />

      <AdminActivityFilterSheet open={filtersOpen} onOpenChange={setFiltersOpen} type={type} onTypeChange={setType} />

      {hasMore && (
        <Button variant="outline" size="sm" className="justify-self-center" onClick={loadMore}>
          {t("activityLoadMore")}
        </Button>
      )}
    </div>
  );
}

/**
 * Who did it: the monogram, the name, and the email under it — the email
 * because an audit trail names people by something that does not change
 * when they edit their profile. An account that is gone has neither, and
 * says so with a dash rather than an empty line.
 */
function Actor({ entry }: { entry: PlatformActivityEntryDTO }) {
  const name = entry.actorName || entry.actorEmail || "—";
  return (
    <div className="flex items-center gap-3">
      <Avatar className="h-9 w-9 shrink-0">
        <AvatarFallback className="text-xs">{initialsFrom(name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="type-body-medium truncate font-semibold">{name}</p>
        <p className="type-caption truncate text-[var(--color-muted-foreground)]">
          {name === entry.actorEmail ? "" : (entry.actorEmail ?? "")}
        </p>
      </div>
    </div>
  );
}
