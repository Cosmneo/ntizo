import { useTranslation } from "react-i18next";
import { MoreHorizontal, Search, SlidersHorizontal } from "lucide-react";
import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Skeleton,
  cn,
} from "@ntizo/frontend-ui";
import type { PeopleFilters, PersonRow, PersonStatus } from "../domain/people";
import type { ProviderRole } from "../domain/types";

const STATUS_TONE: Record<PersonStatus, "success" | "warning" | "danger"> = {
  active: "success",
  invited: "warning",
  expired: "danger",
};

function initialsOf(row: PersonRow): string {
  const source = row.name ?? row.email;
  return source
    .split(/[\s@.]+/)
    .filter(Boolean)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

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
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)]">
      <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
        <div className="min-w-0">
          <p className="type-caption font-bold tracking-[0.14em] text-[var(--color-muted-foreground)] uppercase">
            {t("peopleTitle")}
          </p>
          {/* Two numbers, not one. With a filter on, "2" alone is a lie about
              the size of the team. */}
          <p className="type-body mt-0.5">
            {loading ? (
              <Skeleton className="h-[19px] w-24" />
            ) : (
              t("peopleShown", { shown: rows.length, total })
            )}
          </p>
        </div>

        <div className="flex flex-1 flex-wrap items-center justify-end gap-2.5">
          <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--color-muted-foreground)]" />
            <Input
              value={filters.query}
              onChange={(e) =>
                onFiltersChange({ ...filters, query: e.target.value })
              }
              placeholder={t("peopleSearchPlaceholder")}
              aria-label={t("peopleSearchPlaceholder")}
              className="pl-9"
            />
          </div>
          <Button type="button" variant="outline" onClick={onOpenFilters}>
            <SlidersHorizontal className="h-4 w-4" />
            {t("peopleFilter")}
            {activeFilterCount > 0 && (
              <span className="ml-1 grid h-5 min-w-5 place-items-center rounded-full bg-[var(--color-primary)] px-1.5 text-[11px] font-semibold text-[var(--color-primary-foreground)]">
                {activeFilterCount}
              </span>
            )}
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-y border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-muted)_35%,transparent)]">
              <Th className="pl-5">{t("peoplePerson")}</Th>
              <Th>{t("peopleRole")}</Th>
              <Th>{t("peopleStatusLabel")}</Th>
              <Th>{t("peopleDate")}</Th>
              <Th className="pr-5 text-right">{t("peopleActions")}</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <RowSkeletons />
            ) : rows.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="type-body px-5 py-14 text-center text-[var(--color-muted-foreground)]"
                >
                  {total === 0 ? t("peopleEmpty") : t("peopleNoMatches")}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.key}
                  className="border-b border-[var(--color-border)] last:border-b-0"
                >
                  <td className="py-3.5 pl-5">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9 shrink-0">
                        <AvatarFallback className="text-xs">
                          {initialsOf(row)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="type-body-medium truncate font-semibold">
                          {/* An invitation has no name, so the address stands
                              in for one rather than leaving the cell blank. */}
                          {row.name ?? row.email}
                        </p>
                        <p className="type-caption truncate text-[var(--color-muted-foreground)]">
                          {row.name ? row.email : t("peopleInvitePending")}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="type-body py-3.5 pr-4">
                    {t(`peopleRoles.${row.role}`)}
                  </td>
                  <td className="py-3.5 pr-4">
                    <Badge tone={STATUS_TONE[row.status]}>
                      {t(`peopleStatus.${row.status}`)}
                    </Badge>
                  </td>
                  <td className="type-body py-3.5 pr-4 text-[var(--color-muted-foreground)] tabular-nums">
                    {row.date ? dateFormat.format(new Date(row.date)) : "—"}
                  </td>
                  <td className="py-3.5 pr-5 text-right">
                    <RowActions
                      row={row}
                      canManage={canManage}
                      onChangeRole={onChangeRole}
                      onRemove={onRemove}
                      onRevoke={onRevoke}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <th
      className={cn(
        "type-caption py-2.5 pr-4 text-left font-bold tracking-[0.1em] text-[var(--color-muted-foreground)] uppercase",
        className,
      )}
    >
      {children}
    </th>
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
          className="grid h-8 w-8 place-items-center rounded-full text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]"
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

function RowSkeletons() {
  return (
    <>
      {Array.from({ length: 3 }, (_, i) => (
        <tr
          key={i}
          className="border-b border-[var(--color-border)] last:border-b-0"
        >
          <td className="py-3.5 pl-5">
            <div className="flex items-center gap-3">
              <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
              <div className="grid gap-1.5">
                <Skeleton className="h-[19px] w-36" />
                <Skeleton className="h-[17px] w-52" />
              </div>
            </div>
          </td>
          <td className="py-3.5 pr-4">
            <Skeleton className="h-[19px] w-16" />
          </td>
          <td className="py-3.5 pr-4">
            <Skeleton className="h-[22px] w-20 rounded-full" />
          </td>
          <td className="py-3.5 pr-4">
            <Skeleton className="h-[19px] w-24" />
          </td>
          <td className="py-3.5 pr-5">
            <Skeleton className="ml-auto h-8 w-8 rounded-full" />
          </td>
        </tr>
      ))}
    </>
  );
}
