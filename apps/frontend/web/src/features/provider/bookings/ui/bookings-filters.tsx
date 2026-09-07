import { useTranslation } from "react-i18next";
import { Select } from "@ntizo/frontend-ui";
import type { ProviderBookingPageDTO } from "@ntizo/shared/read-models";
import { FilterField, FilterSheet } from "@/shared/components/filter-sheet";
import { PROVIDER_TABS, type ProviderTab } from "../domain/status";

/** The tab the page opens on, and the one "Clear filters" goes back to. */
export const DEFAULT_PROVIDER_TAB: ProviderTab = "requests";

export interface BookingFilters {
  tab: ProviderTab;
  memberId: string | null;
}

/** How many of the two are set to something other than the default — the number on the Filter button. */
export function bookingFilterCount(filters: BookingFilters): number {
  return (filters.tab !== DEFAULT_PROVIDER_TAB ? 1 : 0) + (filters.memberId !== null ? 1 : 0);
}

/**
 * The workspace's booking filters, in the panel every list shares.
 *
 * The three tabs used to be a row above the card and the professional a
 * native `select` beside it — two controls in a place no other list keeps
 * its filters. They are still what they were: the tab is a different
 * question per choice (answer, prepare, look back), so its picker always has
 * a value and "Clear filters" means the first one; the professional narrows
 * that list, and is offered only when the workspace has more than one.
 */
export function BookingsFilterSheet({
  open,
  onOpenChange,
  filters,
  members,
  onChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: BookingFilters;
  /** The workspace's roster, from the last page answered. */
  members: ProviderBookingPageDTO["members"];
  onChange: (next: BookingFilters) => void;
}) {
  const { t } = useTranslation("provider");

  return (
    <FilterSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("bookings.filterTitle")}
      canClear={bookingFilterCount(filters) > 0}
      onClear={() => onChange({ tab: DEFAULT_PROVIDER_TAB, memberId: null })}
    >
      <FilterField id="filter-tab" label={t("bookings.showLabel")}>
        <Select
          id="filter-tab"
          value={filters.tab}
          onChange={(value) => onChange({ ...filters, tab: value as ProviderTab })}
          ariaLabel={t("bookings.showLabel")}
          options={PROVIDER_TABS.map((key) => ({ value: key, label: t(`bookings.tab.${key}`) }))}
        />
      </FilterField>

      {members.length > 1 && (
        <FilterField id="filter-member" label={t("bookings.memberLabel")}>
          <Select
            id="filter-member"
            value={filters.memberId ?? ""}
            onChange={(value) => onChange({ ...filters, memberId: value || null })}
            ariaLabel={t("bookings.memberLabel")}
            options={[
              { value: "", label: t("bookings.memberFilterAll") },
              ...members.map((m) => ({ value: m.id, label: m.firstName })),
            ]}
          />
        </FilterField>
      )}
    </FilterSheet>
  );
}
