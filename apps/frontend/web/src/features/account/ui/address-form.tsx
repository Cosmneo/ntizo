import { useTranslation } from "react-i18next";
import { useForm } from "@tanstack/react-form";
import type { AddressDTO } from "@ntizo/shared";
import { Button, CitySelect, CountrySelect, Input, Label } from "@ntizo/frontend-ui";
import { useCities } from "@/features/account/viewmodel/use-cities";

/**
 * Bridges the city field to the gazetteer.
 *
 * Its own component because the query has to key off the country, and a hook
 * cannot be called inside the `Subscribe` render prop that supplies it. The
 * search term IS the field's value: the user is typing the city they want, and
 * a separate query box for the same thing would be one box too many.
 */
function CityField({
  id,
  country,
  value,
  onChange,
}: {
  id: string;
  country: string;
  value: string;
  onChange: (next: string) => void;
}) {
  const { t } = useTranslation("account");
  const { cities, loading } = useCities(country, value);

  return (
    <CitySelect
      id={id}
      value={value}
      onChange={onChange}
      cities={cities}
      loading={loading}
      placeholder={t("addrCityPlaceholder")}
      toggleLabel={t("addrCityToggle")}
      noResultsText={t("addrCityNoResults")}
      loadingText={t("addrCityLoading")}
      required
    />
  );
}

/**
 * Attribution for the city data.
 *
 * Not optional politeness: GeoNames ships under CC BY 4.0, and the licence
 * requires crediting the source wherever the data is shown. It sits by the
 * field it describes rather than in a page nobody opens.
 */
function CityDataCredit() {
  const { t } = useTranslation("account");
  return (
    <p className="type-caption text-[var(--color-muted-foreground)]">
      {t("addrCityCredit")}{" "}
      <a
        href="https://www.geonames.org/"
        target="_blank"
        rel="noreferrer noopener"
        className="underline underline-offset-2"
      >
        GeoNames
      </a>{" "}
      (CC BY 4.0)
    </p>
  );
}

/**
 * The one form that writes an address, wherever an address is written.
 *
 * It lived inside `AddressesPage` until checkout's step 2 needed the same
 * fields: a customer who has saved no address cannot book without adding one
 * there, and a second form would be a second answer to what an address is —
 * one of them missing the gazetteer, or the district, or the directions field
 * that is often how a provider actually finds the door.
 *
 * It runs no mutation of its own. `onSubmit` hands the values back and the
 * caller decides what they mean: the account page is saving a row, checkout
 * is adding one and then selecting it. A form that owned the mutation could
 * not serve both.
 */
export function AddressForm({
  ariaLabel,
  initial,
  onCancel,
  onSubmit,
  submitting,
}: {
  /**
   * Names the form for a screen reader — and, being a name, is what promotes
   * this from an anonymous group of fields to a `form` landmark somebody can
   * jump to. "New address" and "Edit address" are different things and the
   * caller is the only one that knows which this is.
   */
  ariaLabel: string;
  initial?: AddressDTO;
  /**
   * Optional, because there is a caller with nothing to cancel back to:
   * checkout shows this form *as* its empty state, and a customer with no
   * saved address must add one to go on. A cancel button there would offer a
   * way out of a step that has no way out.
   */
  onCancel?: () => void;
  onSubmit: (values: {
    label: string;
    country: string;
    city: string;
    line1: string;
    district: string | null;
    directions: string | null;
    isDefault: boolean;
  }) => Promise<void>;
  submitting: boolean;
}) {
  const { t, i18n } = useTranslation("account");
  const { t: tc } = useTranslation("auth");

  const form = useForm({
    defaultValues: {
      label: initial?.label ?? "",
      country: initial?.country ?? "MZ",
      city: initial?.city ?? "",
      line1: initial?.line1 ?? "",
      district: initial?.district ?? "",
      directions: initial?.directions ?? "",
      isDefault: initial?.isDefault ?? false,
    },
    validators: {
      onSubmitAsync: async ({ value }) => {
        try {
          await onSubmit({
            label: value.label,
            country: value.country,
            city: value.city,
            line1: value.line1,
            // Empty is cleared, not omitted: the field was on screen and the
            // user emptied it, which is an instruction.
            district: value.district.trim() || null,
            directions: value.directions.trim() || null,
            isDefault: value.isDefault,
          });
          return null;
        } catch (error) {
          return {
            form: error instanceof Error ? error.message : t("saveFailed"),
          };
        }
      },
    },
  });

  return (
    <form
      aria-label={ariaLabel}
      className="grid gap-4 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-background)] p-5"
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.Subscribe selector={(s) => s.errorMap.onSubmit}>
        {(error) =>
          error ? (
            <p className="type-body-medium text-[var(--color-destructive)]">
              {error.form}
            </p>
          ) : null
        }
      </form.Subscribe>

      <div className="grid gap-4 sm:grid-cols-2">
        <form.Field name="label">
          {(field) => (
            <div className="grid gap-1.5">
              <Label htmlFor={field.name}>{t("addrLabel")}</Label>
              <Input
                id={field.name}
                placeholder={t("addrLabelPlaceholder")}
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                required
              />
            </div>
          )}
        </form.Field>

        <form.Field name="country">
          {(field) => (
            <div className="grid gap-1.5">
              <Label htmlFor={field.name}>{t("addrCountry")}</Label>
              {/* The same searchable list the phone field uses. A four-entry
                  hardcoded select was wrong twice over: it named the markets
                  we happen to serve today as the only places a customer can
                  live, and it disagreed with the phone field about how a
                  country is spelled. */}
              <CountrySelect
                id={field.name}
                value={field.state.value}
                onChange={(code) => {
                  field.handleChange(code);
                  // The city suggestions belong to a country. Keeping the old
                  // city after switching would leave "Maputo, Portugal" on
                  // screen, which the user has to notice to fix.
                  form.setFieldValue("city", "");
                }}
                locale={i18n.resolvedLanguage ?? i18n.language}
                ariaLabel={t("addrCountry")}
                searchPlaceholder={tc("countrySearchPlaceholder")}
                noResultsText={tc("countryNoResults")}
              />
            </div>
          )}
        </form.Field>

        <form.Field name="city">
          {(field) => (
            <div className="grid gap-1.5">
              <Label htmlFor={field.name}>{t("addrCity")}</Label>
              <form.Subscribe selector={(st) => st.values.country}>
                {(country) => (
                  <CityField
                    id={field.name}
                    country={country}
                    value={field.state.value}
                    onChange={field.handleChange}
                  />
                )}
              </form.Subscribe>
            </div>
          )}
        </form.Field>

        <form.Field name="district">
          {(field) => (
            <div className="grid gap-1.5">
              <Label htmlFor={field.name}>{t("addrDistrict")}</Label>
              <Input
                id={field.name}
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
              />
            </div>
          )}
        </form.Field>
      </div>

      <form.Field name="line1">
        {(field) => (
          <div className="grid gap-1.5">
            <Label htmlFor={field.name}>{t("addrLine1")}</Label>
            <Input
              id={field.name}
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              required
            />
          </div>
        )}
      </form.Field>

      <form.Field name="directions">
        {(field) => (
          <div className="grid gap-1.5">
            <Label htmlFor={field.name}>{t("addrDirections")}</Label>
            {/* The last hundred metres. Prominent, not tucked away: in
                Mozambique this is often how a provider actually finds the
                door, and a structured address alone would not get them there. */}
            <textarea
              id={field.name}
              rows={2}
              placeholder={t("addrDirectionsPlaceholder")}
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              className="type-body rounded-[var(--radius-field)] border border-[var(--color-input)] bg-[var(--color-background)] px-3.5 py-2.5 focus-visible:border-[var(--color-primary)] focus-visible:outline-none"
            />
          </div>
        )}
      </form.Field>

      <form.Field name="isDefault">
        {(field) => (
          <label className="type-body-medium flex items-center gap-2">
            <input
              type="checkbox"
              checked={field.state.value}
              onChange={(e) => field.handleChange(e.target.checked)}
              className="h-4 w-4 accent-[var(--color-primary)]"
            />
            {t("addrSetDefault")}
          </label>
        )}
      </form.Field>

      <div className="flex gap-3">
        <Button type="submit" disabled={submitting}>
          {submitting ? t("saving") : t("save")}
        </Button>
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>
            {t("cancel")}
          </Button>
        ) : null}
      </div>

      <CityDataCredit />
    </form>
  );
}
