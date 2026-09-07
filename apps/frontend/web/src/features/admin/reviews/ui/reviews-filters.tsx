import { useTranslation } from "react-i18next";
import { Select } from "@ntizo/frontend-ui";
import { FilterField, FilterSheet } from "@/shared/components/filter-sheet";

/**
 * The review list's one filter, in the panel every list shares.
 *
 * "On the home page" was a toggle button floating above the card — the one
 * list whose filter was a different control in a different place from the
 * provider queue's next door. It is a two-way choice, so it is a picker with
 * two options rather than a checkbox: the panel's fields read the same way
 * whether a list has one filter or four.
 */
export function ReviewsFilterSheet({
  open,
  onOpenChange,
  featuredOnly,
  onFeaturedOnlyChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  featuredOnly: boolean;
  onFeaturedOnlyChange: (featuredOnly: boolean) => void;
}) {
  const { t } = useTranslation("admin");

  return (
    <FilterSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("reviewsFilterTitle")}
      canClear={featuredOnly}
      onClear={() => onFeaturedOnlyChange(false)}
    >
      <FilterField id="filter-home" label={t("reviewsFilterHome")}>
        <Select
          id="filter-home"
          value={featuredOnly ? "featured" : ""}
          onChange={(value) => onFeaturedOnlyChange(value === "featured")}
          ariaLabel={t("reviewsFilterHome")}
          options={[
            { value: "", label: t("reviewsAllReviews") },
            { value: "featured", label: t("reviewsOnHomeFilter") },
          ]}
        />
      </FilterField>
    </FilterSheet>
  );
}
