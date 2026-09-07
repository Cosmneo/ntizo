import { useTranslation } from "react-i18next";
import { Select } from "@ntizo/frontend-ui";
import { ProviderStatus } from "@ntizo/shared";
import { FilterField, FilterSheet } from "@/shared/components/filter-sheet";

/**
 * The provider queue's filters, in the panel every list shares.
 *
 * The status picker sat loose above the card before — a bare dropdown floating
 * over the page, which is a different control in a different place doing the
 * same job as the one next door. Somebody moving between lists should find
 * filters in one place, opened one way.
 */
export function ProvidersFilterSheet({
  open,
  onOpenChange,
  status,
  onStatusChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status: string;
  onStatusChange: (status: string) => void;
}) {
  const { t } = useTranslation("admin");

  return (
    <FilterSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("providersFilterTitle")}
      canClear={status !== ""}
      onClear={() => onStatusChange("")}
    >
      <FilterField id="filter-status" label={t("providersStatus")}>
        <Select
          id="filter-status"
          value={status}
          onChange={onStatusChange}
          ariaLabel={t("providersStatus")}
          options={[
            { value: "", label: t("providersAllStatuses") },
            ...Object.values(ProviderStatus).map((value) => ({
              value,
              label: t(`providerStatus.${value}`),
            })),
          ]}
        />
      </FilterField>
    </FilterSheet>
  );
}
