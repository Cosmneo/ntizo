import { useTranslation } from "react-i18next";
import { Select } from "@ntizo/frontend-ui";
import type { ContactRequestKind, ContactRequestStatus } from "@ntizo/shared";
import { FilterField, FilterSheet } from "@/shared/components/filter-sheet";

const KINDS: readonly ContactRequestKind[] = ["contact", "feedback"];

/** What the queue shows when nobody has touched the filters: open requests, of either kind. */
export const DEFAULT_CONTACT_FILTERS: ContactFilters = { kind: undefined, status: "open" };

export interface ContactFilters {
  kind: ContactRequestKind | undefined;
  /** `undefined` is every status — the one value that is not the default. */
  status: ContactRequestStatus | undefined;
}

/** How many of the two are set to something other than the default — the number on the Filter button. */
export function contactFilterCount(filters: ContactFilters): number {
  return (filters.kind !== undefined ? 1 : 0) + (filters.status !== "open" ? 1 : 0);
}

/**
 * The contact queue's filters, in the panel every list shares.
 *
 * Two rows of toggle buttons used to sit above the card. Open is still the
 * default — the queue is worked, not browsed — so "Clear filters" goes back
 * to open requests of either kind, which is what the page shows on arrival.
 */
export function ContactFilterSheet({
  open,
  onOpenChange,
  filters,
  onChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: ContactFilters;
  onChange: (next: ContactFilters) => void;
}) {
  const { t } = useTranslation("admin");

  return (
    <FilterSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("contactFilterTitle")}
      canClear={contactFilterCount(filters) > 0}
      onClear={() => onChange(DEFAULT_CONTACT_FILTERS)}
    >
      <FilterField id="filter-kind" label={t("contactKindColumn")}>
        <Select
          id="filter-kind"
          value={filters.kind ?? ""}
          onChange={(value) => onChange({ ...filters, kind: (value || undefined) as ContactRequestKind | undefined })}
          ariaLabel={t("contactKindColumn")}
          options={[
            { value: "", label: t("contactKindAll") },
            ...KINDS.map((kind) => ({ value: kind, label: t(`contactKind.${kind}`) })),
          ]}
        />
      </FilterField>

      <FilterField id="filter-status" label={t("contactStatusLabel")}>
        <Select
          id="filter-status"
          value={filters.status ?? "all"}
          onChange={(value) =>
            onChange({ ...filters, status: value === "all" ? undefined : (value as ContactRequestStatus) })
          }
          ariaLabel={t("contactStatusLabel")}
          options={[
            { value: "open", label: t("contactStatus.open") },
            { value: "resolved", label: t("contactStatus.resolved") },
            { value: "all", label: t("contactStatusAll") },
          ]}
        />
      </FilterField>
    </FilterSheet>
  );
}
