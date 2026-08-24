import type { Dispatch, SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { ChoiceChips, Input, Select, type SelectOption } from "@ntizo/frontend-ui";
import { Field } from "@/shared/components/wizard/wizard-chrome";
import { IN_PERSON_LOCATION_TYPES, type ServiceDraft } from "../../domain/service-draft";
import type { ServiceLocationType } from "../../domain/types";

/**
 * Step 1: name, category and where it happens.
 *
 * The two-step location question survives the move from the section editor
 * unchanged: it is still asked in two parts, and "unanswered" is still
 * tracked apart from `locationType`, because both are the empty string. That
 * distinction lives in the viewmodel's `locationChoice`; this component only
 * renders whichever part is currently relevant.
 *
 * The label wrapper is now the wizard's shared `Field` rather than the
 * editor's own uppercase-caption one — the point of the rebuild is that a
 * service screen and an onboarding screen look like the same product.
 */
export function StepBasics({
  draft,
  setDraft,
  categories,
  locationChoice,
  onLocationChoiceChange,
}: {
  draft: ServiceDraft;
  setDraft: Dispatch<SetStateAction<ServiceDraft>>;
  categories: { options: SelectOption[]; loading: boolean };
  locationChoice: "remote" | "in_person" | "";
  onLocationChoiceChange: (choice: "remote" | "in_person" | "") => void;
}) {
  const { t } = useTranslation("provider");

  return (
    <div className="grid gap-5">
      <Field label={t("serviceName")} htmlFor="service-name">
        <Input
          id="service-name"
          value={draft.name}
          autoFocus
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          placeholder={t("serviceNamePlaceholder")}
        />
      </Field>

      <Field label={t("serviceDescription")} hint={t("serviceDescriptionHint")}>
        <textarea
          rows={3}
          value={draft.description}
          onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
          className="type-body rounded-[var(--radius-field)] border border-[var(--color-input)] bg-[var(--color-background)] px-3.5 py-2.5 focus-visible:border-[var(--color-primary)] focus-visible:outline-none"
        />
      </Field>

      {/* A dropdown, not chips. Category is a marketplace-wide taxonomy —
          dozens of rows the provider is hunting a specific term in, not a set
          small enough to scan. Chips put every one of them on screen and
          pushed the two location questions below the fold.

          `searchable` is forced rather than left to `Select`'s own
          length threshold, which only trips above six options: the box would
          then appear or vanish depending on how many categories the platform
          happened to carry that week. */}
      <Field label={t("serviceCategory")} htmlFor="service-category">
        {categories.loading ? (
          <p className="type-body text-[var(--color-muted-foreground)]">
            {t("serviceCategoryLoading")}
          </p>
        ) : (
          <Select
            id="service-category"
            name="service-category"
            value={draft.categoryId}
            onChange={(v) => setDraft((d) => ({ ...d, categoryId: v }))}
            options={categories.options}
            searchable
            placeholder={t("serviceCategoryPlaceholder")}
            searchPlaceholder={t("serviceCategorySearchPlaceholder")}
            noResultsText={t("serviceCategoryNoResults")}
          />
        )}
      </Field>

      {/* Asked in two steps and stored as one value: "in person" is the
          umbrella over three of the four `locationType`s, not a peer of them,
          so it never becomes a value of its own. The second step only
          appears once "in person" has actually been chosen — not merely
          whenever the value isn't "remote", which is also true of the
          unanswered state and would show both steps at once before either
          has been picked. */}
      <ChoiceChips
        name="service-location-choice"
        legend={t("serviceLocationQuestion")}
        showLegend
        value={locationChoice || null}
        onChange={(choice) => {
          const next = choice as "remote" | "in_person";
          onLocationChoiceChange(next);
          if (next === "remote") setDraft((d) => ({ ...d, locationType: "remote" }));
          else setDraft((d) => ({ ...d, locationType: "" }));
        }}
        options={[
          { value: "remote", label: t("serviceLocationRemote") },
          { value: "in_person", label: t("serviceLocationInPerson") },
        ]}
      />

      {locationChoice === "in_person" && (
        <ChoiceChips
          name="service-location-type"
          legend={t("serviceWhereQuestion")}
          showLegend
          value={draft.locationType || null}
          onChange={(v) => setDraft((d) => ({ ...d, locationType: v as ServiceLocationType }))}
          options={IN_PERSON_LOCATION_TYPES.map((v) => ({
            value: v,
            label: t(`serviceLocationType.${v}`),
          }))}
        />
      )}
    </div>
  );
}
