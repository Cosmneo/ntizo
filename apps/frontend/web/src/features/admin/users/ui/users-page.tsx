import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Avatar, AvatarFallback, Badge } from "@ntizo/frontend-ui";
import { CollectionCard } from "@/shared/components/collection-card";
import { initialsFrom } from "@/shared/lib/initials";
import { usePageHeader } from "@/shared/lib/page-header";
import { UsersFilterSheet } from "./users-filters";
import { useAdminUsers } from "../viewmodel/use-admin-users";
import { displayName, type AdminUser } from "../domain/types";

const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "info"> = {
  active: "success",
  pending: "warning",
  suspended: "danger",
};

/**
 * Everyone on the platform.
 *
 * The same card as the provider queue — literally the same component, so the
 * header, the count, the search box, the table and the mobile cards cannot
 * drift apart between the two admin lists. What differs is the columns,
 * because the two lists answer different questions.
 */
export function AdminUsersPage() {
  const { t, i18n } = useTranslation("admin");
  const locale = i18n.resolvedLanguage ?? i18n.language;

  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const query = useAdminUsers({
    ...(search.trim() ? { search: search.trim() } : {}),
    ...(role ? { role } : {}),
  });

  usePageHeader(t("usersTitle"), t("usersSubtitle"));

  const rows = useMemo(() => query.data ?? [], [query.data]);
  const dateFormat = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const numberFormat = new Intl.NumberFormat(locale);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      {query.error && (
        <p className="type-body text-[var(--color-destructive)]">
          {t("usersError")}
        </p>
      )}

      <CollectionCard
        title={t("usersTitle")}
        shown={rows.length}
        total={rows.length}
        loading={query.isLoading}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={t("usersSearchPlaceholder")}
        onOpenFilters={() => setFiltersOpen(true)}
        activeFilterCount={role ? 1 : 0}
        columns={[
          { key: "person", label: t("usersPerson"), className: "pl-5" },
          { key: "role", label: t("usersRole"), skeletonWidth: "w-28" },
          {
            key: "status",
            label: t("usersStatus"),
            skeletonWidth: "w-20",
            skeletonShape: "badge",
          },
          {
            key: "workspaces",
            label: t("usersWorkspaces"),
            align: "right",
            skeletonWidth: "w-8",
          },
          {
            key: "joined",
            label: t("usersJoined"),
            align: "right",
            className: "pr-5",
            skeletonWidth: "w-24",
          },
        ]}
        emptyText={t("usersEmpty")}
        noMatchesText={t("usersNoMatches")}
        filtered={search.trim() !== "" || role !== ""}
        rows={rows.map((user) => ({
          key: user.id,
          primary: <Person user={user} />,
          cells: {
            role: (
              <span className="block max-w-[22ch] truncate">
                {t(`userRole.${user.role}`, { defaultValue: user.role })}
              </span>
            ),
            status: (
              <Badge tone={STATUS_TONE[user.status] ?? "info"}>
                {t(`userStatus.${user.status}`, { defaultValue: user.status })}
              </Badge>
            ),
            workspaces: (
              // Zero as an em dash. Most people on the platform are customers,
              // and a column of "0" reads as data about them when it is really
              // the absence of any.
              <span className="tabular-nums">
                {user.providerCount > 0 ? numberFormat.format(user.providerCount) : "—"}
              </span>
            ),
            joined: (
              <span className="tabular-nums text-[var(--color-muted-foreground)]">
                {dateFormat.format(new Date(user.createdAt))}
              </span>
            ),
          },
        }))}
      />

      <UsersFilterSheet
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        role={role}
        onRoleChange={setRole}
      />
    </div>
  );
}

/** Who the row is about: the monogram, the name, and how to reach them. */
function Person({ user }: { user: AdminUser }) {
  const name = displayName(user);
  return (
    <div className="flex items-center gap-3">
      <Avatar className="h-9 w-9 shrink-0">
        <AvatarFallback className="text-xs">{initialsFrom(name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="type-body-medium truncate font-semibold">{name}</p>
        {/* The email under the name, unless it is already the name — somebody
            with no display name would otherwise get the same string twice.
            The phone takes its place there, and where there is neither, one
            line is the honest amount of what is known about them. */}
        <p className="type-caption truncate text-[var(--color-muted-foreground)]">
          {name === user.email ? (user.phoneNumber ?? "") : user.email}
        </p>
      </div>
    </div>
  );
}

