import type { Dispatch, SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { ChoiceChips, Input, type SelectOption } from "@ntizo/frontend-ui";
import { IN_PERSON_LOCATION_TYPES, type ServiceDraft } from "../../domain/service-draft";
import type { ServiceLocationType } from "../../domain/types";

/**
 * Section 1: name, category and where it happens.
 *
 * Category and the two-step location question moved from `Select`/a bespoke
 * pill button to `ChoiceChips` here — the set is small and each member has a
 * name worth reading, exactly the case the design calls out for chips over a
 * dropdown. What did not move: the location question is still asked in two
 * steps, and "unanswered" is still tracked apart from `locationType`, because
 * both are the empty string. That distinction lives one level up, in
 * `service-editor-page.tsx`'s `locationChoice` state — this component only
 * renders whichever step is currently relevant.
 */
export function BasicsSection({
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
    <div className="grid gap-6">
      <Field label={t("serviceName")}>
        <Input
          id="service-name"
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          placeholder={t("serviceNamePlaceholder")}
        />
      </Field>

      {categories.loading ? (
        <p className="type-body text-[var(--color-muted-foreground)]">
          {t("serviceCategoryLoading")}
        </p>
      ) : (
        <ChoiceChips
          name="service-category"
          legend={t("serviceCategory")}
          showLegend
          options={categories.options}
          value={draft.categoryId || null}
          onChange={(v) => setDraft((d) => ({ ...d, categoryId: v }))}
        />
      )}

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
          onChange={(v) =>
            setDraft((d) => ({ ...d, locationType: v as ServiceLocationType }))
          }
          options={IN_PERSON_LOCATION_TYPES.map((v) => ({
            value: v,
            label: t(`serviceLocationType.${v}`),
          }))}
        />
      )}
    </div>
  );
}

/** The same small label-above-field wrapper every section in this editor uses. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <span className="type-caption font-bold tracking-[0.14em] text-[var(--color-muted-foreground)] uppercase">
        {label}
      </span>
      {children}
    </div>
  );
}
