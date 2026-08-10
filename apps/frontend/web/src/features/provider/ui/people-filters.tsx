import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { Button, Select, Sheet, SheetContent } from "@ntizo/frontend-ui";
import {
  EMPTY_FILTERS,
  type PeopleFilters,
  type PersonStatus,
} from "../domain/people";
import type { ProviderRole } from "../domain/types";

/**
 * The filter panel, in a sheet on the right.
 *
 * A sheet rather than a popover under the button, following the reference. Two
 * pickers fit in a popover, but the panel is where a third and fourth will go —
 * date joined, invited-by — and a popover that grows into a form is a popover
 * that starts covering the table it filters.
 *
 * Filters apply as they change; there is no Apply button. The list is right
 * there and updates under the panel, so the result *is* the feedback — an Apply
 * step would only add a way to set a filter and not get it.
 */
export function PeopleFilterSheet({
  open,
  onOpenChange,
  filters,
  onChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: PeopleFilters;
  onChange: (next: PeopleFilters) => void;
}) {
  const { t } = useTranslation("provider");

  const roleOptions = [
    { value: "", label: t("peopleAllRoles") },
    { value: "owner", label: t("peopleRoles.owner") },
    { value: "admin", label: t("peopleRoles.admin") },
    { value: "staff", label: t("peopleRoles.staff") },
  ];

  const statusOptions = [
    { value: "", label: t("peopleAllStatuses") },
    { value: "active", label: t("peopleStatus.active") },
    { value: "invited", label: t("peopleStatus.invited") },
    { value: "expired", label: t("peopleStatus.expired") },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full max-w-sm flex-col">
        <div className="flex items-start justify-between border-b border-[var(--color-border)] px-5 py-4">
          <h2 className="type-h3 font-semibold">{t("peopleFilterTitle")}</h2>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label={t("close")}
            className="grid h-8 w-8 place-items-center rounded-full text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid flex-1 content-start gap-5 overflow-y-auto p-5">
          <div className="grid gap-1.5">
            <label
              htmlFor="filter-role"
              className="type-caption font-bold tracking-[0.14em] text-[var(--color-muted-foreground)] uppercase"
            >
              {t("peopleRole")}
            </label>
            <Select
              id="filter-role"
              value={filters.role ?? ""}
              onChange={(value) =>
                onChange({
                  ...filters,
                  role: (value || null) as ProviderRole | null,
                })
              }
              options={roleOptions}
              ariaLabel={t("peopleRole")}
            />
          </div>

          <div className="grid gap-1.5">
            <label
              htmlFor="filter-status"
              className="type-caption font-bold tracking-[0.14em] text-[var(--color-muted-foreground)] uppercase"
            >
              {t("peopleStatusLabel")}
            </label>
            <Select
              id="filter-status"
              value={filters.status ?? ""}
              onChange={(value) =>
                onChange({
                  ...filters,
                  status: (value || null) as PersonStatus | null,
                })
              }
              options={statusOptions}
              ariaLabel={t("peopleStatusLabel")}
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-[var(--color-border)] px-5 py-4">
          {/* Only offered when it would do something. A permanently-live
              "clear" reads as a control that does nothing. The search box is
              deliberately left alone — it lives outside this panel, in sight,
              and clearing something the person cannot see from here is worse
              than leaving it. */}
          <Button
            type="button"
            variant="ghost"
            disabled={filters.role === null && filters.status === null}
            onClick={() => onChange({ ...EMPTY_FILTERS, query: filters.query })}
          >
            {t("peopleClearFilters")}
          </Button>
          <Button type="button" onClick={() => onOpenChange(false)}>
            {t("close")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Whether the Filter button should show it is doing something. */
export function filterCount(filters: PeopleFilters): number {
  return (filters.role ? 1 : 0) + (filters.status ? 1 : 0);
}
