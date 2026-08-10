import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useForm } from "@tanstack/react-form";
import { toast } from "sonner";
import { MapPin, Plus, Star, Trash2 } from "lucide-react";
import type { AddressDTO } from "@ntizo/shared";
import {
  Badge,
  Button,
  CitySelect,
  CountrySelect,
  Input,
  Label,
  countryName,
} from "@ntizo/frontend-ui";
import { useAddressMutations, useMyAddresses } from "@/features/account/viewmodel/use-addresses";
import { EmptyState } from "@/features/account/ui/empty-state";

function AddressForm({
  initial,
  onCancel,
  onSubmit,
  submitting,
}: {
  initial?: AddressDTO;
  onCancel: () => void;
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
          return { form: error instanceof Error ? error.message : t("saveFailed") };
        }
      },
    },
  });

  return (
    <form
      className="grid gap-4 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-background)] p-5"
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.Subscribe selector={(s) => s.errorMap.onSubmit}>
        {(error) =>
          error ? (
            <p className="type-body-medium text-[var(--color-destructive)]">{error.form}</p>
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
                  <CitySelect
                    id={field.name}
                    value={field.state.value}
                    onChange={field.handleChange}
                    country={country}
                    placeholder={t("addrCityPlaceholder")}
                    toggleLabel={t("addrCityToggle")}
                    required
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
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}

function AddressCard({
  address,
  onEdit,
  onDelete,
  onMakeDefault,
  busy,
}: {
  address: AddressDTO;
  onEdit: () => void;
  onDelete: () => void;
  onMakeDefault: () => void;
  busy: boolean;
}) {
  const { t, i18n } = useTranslation("account");
  const lines = [
    address.line1,
    address.line2,
    [address.district, address.city].filter(Boolean).join(", "),
    // Named by the platform, not by a `country.MZ` translation key. The picker
    // offers every country there is, so a key-per-country table would need 245
    // entries in each of the eight languages to stop this line reading "JP".
    countryName(address.country, i18n.resolvedLanguage ?? i18n.language),
  ].filter(Boolean);

  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-background)] p-5">
      <div className="flex flex-wrap items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--radius-card-sm)] bg-[var(--color-muted)]">
          <MapPin className="h-5 w-5 text-[var(--color-primary)]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="type-h3 font-semibold">{address.label}</span>
            {address.isDefault ? <Badge tone="info">{t("addrDefault")}</Badge> : null}
          </div>
          <p className="type-body mt-1 text-[var(--color-muted-foreground)]">
            {lines.join(" · ")}
          </p>
          {address.directions ? (
            <p className="type-caption mt-1.5 text-[var(--color-muted-foreground)]">
              {address.directions}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={onEdit} disabled={busy}>
          {t("edit")}
        </Button>
        {!address.isDefault ? (
          <Button variant="ghost" size="sm" onClick={onMakeDefault} disabled={busy}>
            <Star className="h-4 w-4" />
            {t("addrMakeDefault")}
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="sm"
          onClick={onDelete}
          disabled={busy}
          className="ml-auto text-[var(--color-destructive)]"
        >
          <Trash2 className="h-4 w-4" />
          {t("delete")}
        </Button>
      </div>
    </div>
  );
}

export function AddressesPage() {
  const { t } = useTranslation("account");
  const { data: addresses = [], isPending } = useMyAddresses();
  const { add, update, remove } = useAddressMutations();
  const [editing, setEditing] = useState<AddressDTO | "new" | null>(null);

  const busy = add.isPending || update.isPending || remove.isPending;

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="type-h1">{t("navAddresses")}</h1>
          <p className="type-body mt-1 text-[var(--color-muted-foreground)]">
            {t("addressesBlurb")}
          </p>
        </div>
        {editing === null ? (
          <Button onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" />
            {t("addrAdd")}
          </Button>
        ) : null}
      </div>

      {editing !== null ? (
        <div className="mb-4">
          <AddressForm
            initial={editing === "new" ? undefined : editing}
            submitting={busy}
            onCancel={() => setEditing(null)}
            onSubmit={async (values) => {
              if (editing === "new") await add.mutateAsync(values);
              else await update.mutateAsync({ id: editing.id, input: values });
              toast.success(t("saved"));
              setEditing(null);
            }}
          />
        </div>
      ) : null}

      {isPending ? null : addresses.length === 0 && editing === null ? (
        <EmptyState
          icon={<MapPin className="h-6 w-6" />}
          title={t("addressesEmptyTitle")}
          body={t("addressesEmptyBody")}
        />
      ) : (
        <div className="grid gap-4">
          {addresses.map((address) => (
            <AddressCard
              key={address.id}
              address={address}
              busy={busy}
              onEdit={() => setEditing(address)}
              onMakeDefault={() =>
                void update
                  .mutateAsync({ id: address.id, input: { isDefault: true } })
                  .then(() => toast.success(t("saved")))
              }
              onDelete={() =>
                void remove
                  .mutateAsync(address.id)
                  .then(() => toast.success(t("addrDeleted")))
              }
            />
          ))}
        </div>
      )}
    </>
  );
}
