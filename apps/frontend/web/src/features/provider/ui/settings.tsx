import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Building2, MapPin, Undo2 } from "lucide-react";
import {
  Badge,
  Button,
  CitySelect,
  CountrySelect,
  Input,
  Label,
  Select,
  cn,
} from "@ntizo/frontend-ui";
import { PROVIDER_TYPES, ProviderStatus } from "@ntizo/shared";
import { usePageHeader } from "@/shared/lib/page-header";
import { useCities } from "@/features/account/viewmodel/use-cities";
import { providerErrorMessage } from "../viewmodel/error-message";
import { useActiveProvider } from "../viewmodel/use-active-provider";
import { useProviderDetail } from "../viewmodel/use-providers";
import {
  useDeactivateProvider,
  useUpdateProvider,
} from "../viewmodel/use-provider-mutations";
import type { ProviderAddress, ProviderDetail } from "../domain/types";

/** Everything the form owns, in one shape so "has it changed" is one comparison. */
interface Draft {
  name: string;
  description: string;
  street: string;
  city: string;
  district: string;
  country: string;
  postalCode: string;
}

function draftFrom(detail: ProviderDetail | undefined): Draft {
  const address: ProviderAddress = detail?.address ?? {};
  return {
    name: detail?.name ?? "",
    description: detail?.description ?? "",
    street: address.street ?? "",
    city: address.city ?? "",
    district: address.district ?? "",
    country: address.country ?? "MZ",
    postalCode: address.postalCode ?? "",
  };
}

const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "info"> = {
  [ProviderStatus.Active]: "success",
  [ProviderStatus.Pending]: "warning",
  [ProviderStatus.Rejected]: "danger",
  [ProviderStatus.Suspended]: "danger",
  [ProviderStatus.Archived]: "info",
};

export function SettingsPage() {
  const { t, i18n } = useTranslation("provider");
  const { t: ta } = useTranslation("account");
  const { t: tc } = useTranslation("auth");
  const { activeProvider } = useActiveProvider();
  const { data: detail, isLoading, error } = useProviderDetail(activeProvider?.id);
  const updateMut = useUpdateProvider(activeProvider?.id ?? "");
  const deactivateMut = useDeactivateProvider();
  const nav = useNavigate();

  usePageHeader(t("settings"), activeProvider?.name);

  const saved = useMemo(() => draftFrom(detail), [detail]);
  const [draft, setDraft] = useState<Draft>(saved);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => setDraft(saved), [saved]);

  const cityQuery = useCities(draft.country, draft.city);

  // What the save bar reads. Comparing the whole shape rather than tracking a
  // flag per field means a value edited and put back does not count as a
  // change — which is what "unsaved changes" should mean.
  const dirty = useMemo(
    () => (Object.keys(saved) as Array<keyof Draft>).some((k) => saved[k] !== draft[k]),
    [saved, draft],
  );

  if (!activeProvider) return null;
  if (isLoading) return <p className="type-body">…</p>;
  if (error) {
    return (
      <p className="type-body text-[var(--color-destructive)]">
        {providerErrorMessage(t, error)}
      </p>
    );
  }

  const patch = (next: Partial<Draft>) => setDraft((d) => ({ ...d, ...next }));

  async function save() {
    setMessage(null);
    try {
      await updateMut.mutateAsync({
        name: draft.name.trim(),
        description: draft.description.trim(),
        // Sent whole. The command replaces the address rather than merging, so
        // omitting a field the provider cleared would silently keep the old
        // value and make deleting a line impossible.
        address: {
          street: draft.street.trim(),
          city: draft.city.trim(),
          district: draft.district.trim(),
          country: draft.country,
          postalCode: draft.postalCode.trim(),
        },
      });
      setMessage(t("settingsSaved"));
    } catch (err) {
      setMessage(providerErrorMessage(t, err));
    }
  }

  async function deactivate() {
    try {
      await deactivateMut.mutateAsync(activeProvider!.id);
      await nav({ to: "/provider" });
    } catch (err) {
      setMessage(providerErrorMessage(t, err));
    }
  }

  return (
    <div className="mx-auto max-w-4xl pb-28">
      {/* What the workspace IS, before what can be changed about it. These are
          the values support asks for and nobody can edit, so they are read-only
          facts rather than empty fields. */}
      <section className="rounded-[var(--radius-card)] border border-[var(--color-border)] p-5">
        <h2 className="type-caption font-bold tracking-[0.14em] text-[var(--color-muted-foreground)] uppercase">
          {t("settingsSnapshot")}
        </h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Fact label={t("settingsWorkspaceId")} value={detail?.id ?? ""} mono />
          <Fact label={t("settingsSlug")} value={detail?.slug ?? ""} mono />
          <Fact label={t("settingsType")} value={t(`type.${detail?.type}`)} />
          <div>
            <dt className="type-caption text-[var(--color-muted-foreground)]">
              {t("settingsStatus")}
            </dt>
            <dd className="mt-1.5">
              <Badge tone={STATUS_TONE[detail?.status ?? ""] ?? "info"}>
                {t(`status.${detail?.status}`)}
              </Badge>
            </dd>
          </div>
        </dl>
      </section>

      <Section
        icon={<Building2 className="h-5 w-5" />}
        title={t("settingsIdentity")}
        blurb={t("settingsIdentityBlurb")}
      >
        <div className="grid gap-5">
          <div className="grid gap-1.5">
            <Label htmlFor="name">{t("settingsName")}</Label>
            <Input
              id="name"
              value={draft.name}
              onChange={(e) => patch({ name: e.target.value })}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="description">{t("settingsDescription")}</Label>
            <p className="type-caption text-[var(--color-muted-foreground)]">
              {t("settingsDescriptionHint")}
            </p>
            <textarea
              id="description"
              rows={3}
              value={draft.description}
              onChange={(e) => patch({ description: e.target.value })}
              className="type-body rounded-[var(--radius-field)] border border-[var(--color-input)] bg-[var(--color-background)] px-3.5 py-2.5 focus-visible:border-[var(--color-primary)] focus-visible:outline-none"
            />
          </div>

          {/* Read-only, and said out loud rather than rendered as a dead
              dropdown. The type decides how the calendar and the team work;
              changing it after the fact is a migration, not a setting. */}
          <div className="grid gap-1.5">
            <Label htmlFor="type">{t("settingsType")}</Label>
            <Select
              id="type"
              value={detail?.type ?? ""}
              onChange={() => undefined}
              disabled
              options={PROVIDER_TYPES.map((value) => ({
                value,
                label: t(`type.${value}`),
              }))}
              ariaLabel={t("settingsType")}
            />
            <p className="type-caption text-[var(--color-muted-foreground)]">
              {t("settingsTypeLocked")}
            </p>
          </div>
        </div>
      </Section>

      <Section
        icon={<MapPin className="h-5 w-5" />}
        title={t("settingsAddress")}
        blurb={t("settingsAddressBlurb")}
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="country">{ta("addrCountry")}</Label>
            <CountrySelect
              id="country"
              value={draft.country}
              onChange={(code) => patch({ country: code, city: "" })}
              locale={i18n.resolvedLanguage ?? i18n.language}
              ariaLabel={ta("addrCountry")}
              searchPlaceholder={tc("countrySearchPlaceholder")}
              noResultsText={tc("countryNoResults")}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="city">{ta("addrCity")}</Label>
            <CitySelect
              id="city"
              value={draft.city}
              onChange={(city) => patch({ city })}
              cities={cityQuery.cities}
              loading={cityQuery.loading}
              placeholder={ta("addrCityPlaceholder")}
              toggleLabel={ta("addrCityToggle")}
              noResultsText={ta("addrCityNoResults")}
              loadingText={ta("addrCityLoading")}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="district">{ta("addrDistrict")}</Label>
            <Input
              id="district"
              value={draft.district}
              onChange={(e) => patch({ district: e.target.value })}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="postalCode">{ta("addrPostalCode")}</Label>
            <Input
              id="postalCode"
              value={draft.postalCode}
              onChange={(e) => patch({ postalCode: e.target.value })}
            />
          </div>

          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="street">{ta("addrLine1")}</Label>
            <Input
              id="street"
              value={draft.street}
              onChange={(e) => patch({ street: e.target.value })}
            />
          </div>
        </div>
      </Section>

      <Section
        icon={<AlertTriangle className="h-5 w-5 text-[var(--color-destructive)]" />}
        title={t("dangerZone")}
        blurb={t("deactivateWarning")}
        tone="danger"
      >
        <Button variant="destructive" onClick={() => void deactivate()}>
          {t("deactivate")}
        </Button>
      </Section>

      {/* Fixed, and present whether or not anything changed. A save bar that
          appears only when dirty moves the page under the reader at the moment
          they edit their first field. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--color-border)] bg-[var(--color-background)]/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-3.5">
          <div className="min-w-0">
            <p className="type-body-medium font-semibold">
              {dirty ? t("settingsUnsaved") : (message ?? t("settingsNoChanges"))}
            </p>
            <p className="type-caption text-[var(--color-muted-foreground)]">
              {t("settingsSaveHint")}
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <Button
              type="button"
              variant="outline"
              disabled={!dirty}
              onClick={() => {
                setDraft(saved);
                setMessage(null);
              }}
            >
              <Undo2 className="h-4 w-4" />
              {t("settingsDiscard")}
            </Button>
            <Button disabled={!dirty || updateMut.isPending} onClick={() => void save()}>
              {updateMut.isPending ? t("settingsSaving") : t("settingsSave")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** A value nobody can change, shown as one. */
function Fact({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="type-caption text-[var(--color-muted-foreground)]">{label}</dt>
      <dd
        className={cn(
          "type-body-medium mt-1 truncate font-semibold",
          mono && "font-mono text-[13px]",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function Section({
  icon,
  title,
  blurb,
  tone,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  blurb: string;
  tone?: "danger";
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "mt-5 rounded-[var(--radius-card)] border p-6",
        tone === "danger"
          ? "border-[color-mix(in_srgb,var(--color-destructive)_30%,transparent)] bg-[color-mix(in_srgb,var(--color-destructive)_4%,transparent)]"
          : "border-[var(--color-border)]",
      )}
    >
      <div className="mb-6 flex items-start gap-3.5">
        <span
          className={cn(
            "grid h-10 w-10 shrink-0 place-items-center rounded-[var(--radius-card-sm)]",
            tone === "danger"
              ? "bg-[color-mix(in_srgb,var(--color-destructive)_12%,transparent)]"
              : "bg-[var(--color-muted)] text-[var(--color-primary)]",
          )}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <h2 className="type-h3 font-semibold">{title}</h2>
          <p className="type-body mt-1 text-[var(--color-muted-foreground)]">{blurb}</p>
        </div>
      </div>
      {children}
    </section>
  );
}
