import { useTranslation } from "react-i18next";
import { Select } from "@ntizo/frontend-ui";
import { FilterField, FilterSheet } from "@/shared/components/filter-sheet";
import type { AdminSupportSearch } from "@/features/admin/support/data/admin-support.repository";

export interface SupportFilters {
  /** `undefined` is every status — the one value that is not the default. */
  status: AdminSupportSearch["status"];
  audience: AdminSupportSearch["audience"];
}

/** What the queue shows when nobody has touched the filters: open requests, from anyone. */
export const DEFAULT_SUPPORT_FILTERS: SupportFilters = { status: "open", audience: undefined };

/** How many of the two are set to something other than the default — the number on the Filter button. */
export function supportFilterCount(filters: SupportFilters): number {
  return (filters.status !== "open" ? 1 : 0) + (filters.audience !== undefined ? 1 : 0);
}

/**
 * The support queue's filters, in the panel every list shares.
 *
 * Two rows of toggle buttons used to sit above the card. Open is still the
 * default — the queue is worked, not browsed — so "Clear filters" goes back
 * to open requests from anyone, which is what the page shows on arrival.
 */
export function SupportFilterSheet({
  open,
  onOpenChange,
  filters,
  onChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: SupportFilters;
  onChange: (next: SupportFilters) => void;
}) {
  const { t } = useTranslation("admin");

  return (
    <FilterSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("supportFilterTitle")}
      canClear={supportFilterCount(filters) > 0}
      onClear={() => onChange(DEFAULT_SUPPORT_FILTERS)}
    >
      <FilterField id="filter-status" label={t("supportStatusLabel")}>
        <Select
          id="filter-status"
          value={filters.status ?? "all"}
          onChange={(value) =>
            onChange({ ...filters, status: value === "all" ? undefined : (value as SupportFilters["status"]) })
          }
          ariaLabel={t("supportStatusLabel")}
          options={[
            { value: "open", label: t("supportStatus.open") },
            { value: "resolved", label: t("supportStatus.resolved") },
            { value: "all", label: t("supportStatusAll") },
          ]}
        />
      </FilterField>

      <FilterField id="filter-audience" label={t("supportAudienceLabel")}>
        <Select
          id="filter-audience"
          value={filters.audience ?? ""}
          onChange={(value) => onChange({ ...filters, audience: (value || undefined) as SupportFilters["audience"] })}
          ariaLabel={t("supportAudienceLabel")}
          options={[
            { value: "", label: t("supportAudienceAll") },
            { value: "customer", label: t("supportAudience.customer") },
            { value: "provider", label: t("supportAudience.provider") },
          ]}
        />
      </FilterField>
    </FilterSheet>
  );
}
