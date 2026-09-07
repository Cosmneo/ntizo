import { useTranslation } from "react-i18next";
import { ACTIVITY_TYPES, type ActivityType } from "@ntizo/shared";
import { Select } from "@ntizo/frontend-ui";
import { FilterField, FilterSheet } from "@/shared/components/filter-sheet";
import { activityTypeKey } from "../domain/types";

/**
 * The activity list's one filter, in the panel every list shares: which kind
 * of thing. The options are `ACTIVITY_TYPES` — the same list the field
 * validates against — labelled by `activityKind.*`, the short noun phrase
 * for a badge, as opposed to `activityType.*`, the sentence for a row.
 */
export function AdminActivityFilterSheet({
  open,
  onOpenChange,
  type,
  onTypeChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: ActivityType | undefined;
  onTypeChange: (type: ActivityType | undefined) => void;
}) {
  const { t } = useTranslation("admin");

  return (
    <FilterSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("activityFilterTitle")}
      canClear={type !== undefined}
      onClear={() => onTypeChange(undefined)}
    >
      <FilterField id="filter-type" label={t("activityTypeLabel")}>
        <Select
          id="filter-type"
          value={type ?? ""}
          onChange={(value) => onTypeChange((value || undefined) as ActivityType | undefined)}
          ariaLabel={t("activityTypeLabel")}
          options={[
            { value: "", label: t("activityAllTypes") },
            ...ACTIVITY_TYPES.map((value) => ({
              value,
              label: t(`activityKind.${activityTypeKey(value)}`),
            })),
          ]}
        />
      </FilterField>
    </FilterSheet>
  );
}
