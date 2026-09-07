import { useTranslation } from "react-i18next";
import { Select } from "@ntizo/frontend-ui";
import { FilterField, FilterSheet } from "@/shared/components/filter-sheet";
import {
  EMPTY_FILTERS,
  type PeopleFilters,
  type PersonStatus,
} from "../domain/people";
import type { ProviderRole } from "../domain/types";

/**
 * The people list's filters, in the panel every list shares.
 *
 * A sheet rather than a popover under the button, following the reference. Two
 * pickers fit in a popover, but the panel is where a third and fourth will go —
 * date joined, invited-by — and a popover that grows into a form is a popover
 * that starts covering the table it filters.
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
    <FilterSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("peopleFilterTitle")}
      canClear={filters.role !== null || filters.status !== null}
      // The search box is left where it is: it lives outside this panel.
      onClear={() => onChange({ ...EMPTY_FILTERS, query: filters.query })}
    >
      <FilterField id="filter-role" label={t("peopleRole")}>
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
      </FilterField>

      <FilterField id="filter-status" label={t("peopleStatusLabel")}>
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
      </FilterField>
    </FilterSheet>
  );
}

/** Whether the Filter button should show it is doing something. */
export function filterCount(filters: PeopleFilters): number {
  return (filters.role ? 1 : 0) + (filters.status ? 1 : 0);
}
