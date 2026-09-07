import { useTranslation } from "react-i18next";
import { ADMIN_BOOKING_TABS, type AdminBookingTab } from "@ntizo/shared/read-models";
import { Select } from "@ntizo/frontend-ui";
import { FilterField, FilterSheet } from "@/shared/components/filter-sheet";

/** The queue the page opens on, and the one "Clear filters" goes back to. */
export const DEFAULT_BOOKING_TAB: AdminBookingTab = "unclosed";

/**
 * The booking queue's one filter, in the panel every list shares.
 *
 * The three queues used to be a row of tabs above the card. They are still
 * three different questions rather than one list narrowed —
 * `bookingNeedsAttentionForAdmin` answers a different result set per queue —
 * which is why the picker always has a value and "Clear filters" means the
 * first queue rather than all of them. What changed is where the control
 * lives: in the same panel, behind the same button, as every other list's.
 */
export function BookingsFilterSheet({
  open,
  onOpenChange,
  tab,
  onTabChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tab: AdminBookingTab;
  onTabChange: (tab: AdminBookingTab) => void;
}) {
  const { t } = useTranslation("admin");

  return (
    <FilterSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("bookingsFilterTitle")}
      canClear={tab !== DEFAULT_BOOKING_TAB}
      onClear={() => onTabChange(DEFAULT_BOOKING_TAB)}
    >
      <FilterField id="filter-queue" label={t("bookingsQueueLabel")}>
        <Select
          id="filter-queue"
          value={tab}
          onChange={(value) => onTabChange(value as AdminBookingTab)}
          ariaLabel={t("bookingsQueueLabel")}
          options={ADMIN_BOOKING_TABS.map((key) => ({ value: key, label: t(`bookingsTab.${key}`) }))}
        />
      </FilterField>
    </FilterSheet>
  );
}
