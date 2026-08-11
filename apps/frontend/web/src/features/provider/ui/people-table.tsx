import { useTranslation } from "react-i18next";
import { MoreHorizontal } from "lucide-react";
import { CollectionCard } from "@/shared/components/collection-card";
import { initialsFrom } from "@/shared/lib/initials";
import {
  Avatar,
  AvatarFallback,
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@ntizo/frontend-ui";
import type { PeopleFilters, PersonRow, PersonStatus } from "../domain/people";
import type { ProviderRole } from "../domain/types";

const STATUS_TONE: Record<PersonStatus, "success" | "warning" | "danger"> = {
  active: "success",
  invited: "warning",
  expired: "danger",
};


/**
 * Everyone on the workspace, in one table.
 *
 * Members and invitations share the table because they answer the same
 * question — who is on this team — and differ only in a badge. Two tables made
 * the same person appear twice when an invitation was accepted, and made the
 * count at the top meaningless because there were two of them.
 *
 * The row's actions differ by kind, and that is the only place the distinction
 * survives: a member's role can change and a member can be removed; an
 * invitation can only be revoked, because there is nobody to demote.
 */
export function PeopleTable({
  rows,
  total,
  loading,
  filters,
  onFiltersChange,
  onOpenFilters,
  activeFilterCount,
  canManage,
  onChangeRole,
  onRemove,
  onRevoke,
}: {
  rows: readonly PersonRow[];
  /** Before filtering, for the "n of m" line. */
  total: number;
  loading: boolean;
  filters: PeopleFilters;
  onFiltersChange: (next: PeopleFilters) => void;
  onOpenFilters: () => void;
  activeFilterCount: number;
  canManage: boolean;
  onChangeRole: (row: PersonRow, role: ProviderRole) => void;
  onRemove: (row: PersonRow) => void;
  onRevoke: (row: PersonRow) => void;
}) {
  const { t, i18n } = useTranslation("provider");

  const dateFormat = new Intl.DateTimeFormat(
    i18n.resolvedLanguage ?? i18n.language,
    {
      day: "numeric",
      month: "short",
      year: "numeric",
    },
  );

  return (
    <CollectionCard
      title={t("peopleTitle")}
      shown={rows.length}
      total={total}
      loading={loading}
      search={filters.query}
      onSearchChange={(query) => onFiltersChange({ ...filters, query })}
      searchPlaceholder={t("peopleSearchPlaceholder")}
      onOpenFilters={onOpenFilters}
      activeFilterCount={activeFilterCount}
      columns={[
        { key: "person", label: t("peoplePerson"), className: "pl-5" },
        { key: "role", label: t("peopleRole"), skeletonWidth: "w-16" },
        {
          key: "status",
          label: t("peopleStatusLabel"),
          skeletonWidth: "w-20",
          skeletonShape: "badge",
        },
        { key: "date", label: t("peopleDate"), skeletonWidth: "w-24" },
        {
          key: "actions",
          label: t("peopleActions"),
          align: "right",
          className: "pr-5",
        },
      ]}
      emptyText={t("peopleEmpty")}
      noMatchesText={t("peopleNoMatches")}
      filtered={total > 0 && rows.length !== total}
      rows={rows.map((row) => ({
        key: row.key,
        primary: <Person row={row} />,
        cells: {
          role: t(`peopleRoles.${row.role}`),
          status: (
            <Badge tone={STATUS_TONE[row.status]}>
              {t(`peopleStatus.${row.status}`)}
            </Badge>
          ),
          date: (
            <span className="tabular-nums text-[var(--color-muted-foreground)]">
              {row.date ? dateFormat.format(new Date(row.date)) : "—"}
            </span>
          ),
        },
        actions: (
          <RowActions
            row={row}
            canManage={canManage}
            onChangeRole={onChangeRole}
            onRemove={onRemove}
            onRevoke={onRevoke}
          />
        ),
      }))}
    />
  );
}

/** Who the row is about. An invitation has no name, so its address stands in. */
function Person({ row }: { row: PersonRow }) {
  const { t } = useTranslation("provider");
  return (
    <div className="flex items-center gap-3">
      <Avatar className="h-9 w-9 shrink-0">
        <AvatarFallback className="text-xs">{initialsFrom(row.name ?? row.email)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="type-body-medium truncate font-semibold">
          {row.name ?? row.email}
        </p>
        <p className="type-caption truncate text-[var(--color-muted-foreground)]">
          {row.name ? row.email : t("peopleInvitePending")}
        </p>
      </div>
    </div>
  );
}

/**
 * What can be done to this row.
 *
 * An owner has no menu at all: the role cannot be changed and the seat cannot
 * be removed, because a workspace with no owner is a workspace nobody can
 * administer. Offering the control and refusing it afterwards is worse than
 * not offering it.
 */
function RowActions({
  row,
  canManage,
  onChangeRole,
  onRemove,
  onRevoke,
}: {
  row: PersonRow;
  canManage: boolean;
  onChangeRole: (row: PersonRow, role: ProviderRole) => void;
  onRemove: (row: PersonRow) => void;
  onRevoke: (row: PersonRow) => void;
}) {
  const { t } = useTranslation("provider");

  if (!canManage || row.role === "owner") return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <button
          type="button"
          aria-label={t("peopleActions")}
          // `ml-auto`, because `grid` makes this a block-level box and a
          // block-level box ignores the cell's `text-align`. Without it the
          // button sat flush left in a right-aligned column, 88px adrift of
          // the header it belongs under.
          className="ml-auto grid h-8 w-8 place-items-center rounded-full text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {row.kind === "member" ? (
          <>
            <DropdownMenuItem
              onSelect={() =>
                onChangeRole(row, row.role === "admin" ? "staff" : "admin")
              }
            >
              {row.role === "admin"
                ? t("peopleMakeStaff")
                : t("peopleMakeAdmin")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onRemove(row)}>
              {t("peopleRemove")}
            </DropdownMenuItem>
          </>
        ) : (
          <DropdownMenuItem onSelect={() => onRevoke(row)}>
            {t("peopleRevoke")}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

