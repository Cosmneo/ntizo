import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  Building2,
  Images,
  MapPin,
  ShieldCheck,
  Undo2,
} from "lucide-react";
import {
  Badge,
  Button,
  CitySelect,
  CountrySelect,
  GalleryUpload,
  Input,
  LogoUpload,
  Label,
  Select,
  cn,
} from "@ntizo/frontend-ui";
import { PROVIDER_TYPES, ProviderStatus, ProviderType } from "@ntizo/shared";
import { usePageHeader } from "@/shared/lib/page-header";
import { useCities } from "@/features/account/viewmodel/use-cities";
import { providerErrorMessage } from "../viewmodel/error-message";
import { useActiveProvider } from "../viewmodel/use-active-provider";
import { useProviderDetail } from "../viewmodel/use-providers";
import {
  useDeactivateProvider,
  useUpdateProvider,
} from "../viewmodel/use-provider-mutations";
import { useImageUpload } from "../viewmodel/use-image-upload";
import { DocumentsSection } from "./documents-section";
import { SettingsNav, type SettingsSection } from "./settings-nav";
import type { ProviderAddress, ProviderDetail } from "../domain/types";

/** Matches the column cap on the mutation input. */
const MAX_PORTFOLIO_IMAGES = 24;

/** Everything the form owns, in one shape so "has it changed" is one comparison. */
interface Draft {
  name: string;
  description: string;
  street: string;
  city: string;
  district: string;
  country: string;
  postalCode: string;
  /** Keys, not URLs — the server composes URLs when it reads them back. */
  logoKey: string | null;
  photoKeys: string[];
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
    logoKey: detail?.logo?.key ?? null,
    photoKeys: (detail?.photos ?? []).map((p) => p.key),
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
  const {
    data: detail,
    isLoading,
    error,
    refetch,
  } = useProviderDetail(activeProvider?.id);
  const updateMut = useUpdateProvider(activeProvider?.id ?? "");
  const deactivateMut = useDeactivateProvider();
  const nav = useNavigate();

  usePageHeader(t("settings"), activeProvider?.name);

  const saved = useMemo(() => draftFrom(detail), [detail]);
  const [draft, setDraft] = useState<Draft>(saved);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => setDraft(saved), [saved]);

  const cityQuery = useCities(draft.country, draft.city);
  const media = useImageUpload(activeProvider?.id);

  // Where a just-uploaded key can be shown from. The saved pairs carry their
  // own URL; an image uploaded a second ago is not in `detail` yet, so its URL
  // is remembered here until the next refetch supplies it.
  const [freshUrls, setFreshUrls] = useState<Record<string, string>>({});
  const urlFor = (key: string): string | null =>
    freshUrls[key] ??
    detail?.photos?.find((p) => p.key === key)?.url ??
    (detail?.logo?.key === key ? detail.logo.url : null);

  // What the save bar reads. Comparing the whole shape rather than tracking a
  // flag per field means a value edited and put back does not count as a
  // change — which is what "unsaved changes" should mean.
  const changed = useMemo(() => {
    const keys = Object.keys(saved) as Array<keyof Draft>;
    return new Set(
      keys.filter((k) => {
        const a = saved[k];
        const b = draft[k];
        // `photoKeys` is an array: `!==` compares references and would report
        // every render as a change, leaving the save bar permanently lit.
        if (Array.isArray(a) && Array.isArray(b)) {
          return a.length !== b.length || a.some((v, i) => v !== b[i]);
        }
        return a !== b;
      }),
    );
  }, [saved, draft]);
  const dirty = changed.size > 0;

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

  // One source for both dots and copy: the set of fields that actually differ.
  const navSections: SettingsSection[] = [
    {
      id: "brand",
      label: t("settingsBrand"),
      icon: <Images className="h-4 w-4" />,
      dirty: changed.has("logoKey") || changed.has("photoKeys"),
    },
    {
      id: "identity",
      label: t("settingsIdentity"),
      icon: <Building2 className="h-4 w-4" />,
      dirty: changed.has("name") || changed.has("description"),
    },
    {
      id: "address",
      label: t("settingsAddress"),
      icon: <MapPin className="h-4 w-4" />,
      dirty: (
        ["street", "city", "district", "country", "postalCode"] as const
      ).some((k) => changed.has(k)),
    },
    {
      id: "documents",
      label: t("settingsDocuments"),
      icon: <ShieldCheck className="h-4 w-4" />,
    },
    {
      id: "danger",
      label: t("dangerZone"),
      icon: <AlertTriangle className="h-4 w-4" />,
      tone: "danger",
    },
  ];

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
        logoKey: draft.logoKey,
        photoKeys: draft.photoKeys,
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
    <>
      <div className="mx-auto max-w-6xl lg:grid lg:grid-cols-[196px_minmax(0,1fr)] lg:gap-10">
        <SettingsNav sections={navSections} title={t("settings")} />

        <div className="min-w-0">
          {/* What the workspace IS, before what can be changed about it. These are
          the values support asks for and nobody can edit, so they are read-only
          facts rather than empty fields. */}
          <section className="rounded-[var(--radius-card)] border border-[var(--color-border)] p-5">
            <h2 className="type-caption font-bold tracking-[0.14em] text-[var(--color-muted-foreground)] uppercase">
              {t("settingsSnapshot")}
            </h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Fact
                label={t("settingsWorkspaceId")}
                value={detail?.id ?? ""}
                mono
              />
              <Fact label={t("settingsSlug")} value={detail?.slug ?? ""} mono />
              <Fact
                label={t("settingsType")}
                value={t(`type.${detail?.type}`)}
              />
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
            id="brand"
            icon={<Images className="h-5 w-5" />}
            title={t("settingsBrand")}
            blurb={t("settingsBrandBlurb")}
          >
            <div className="grid gap-7">
              <LogoUpload
                url={draft.logoKey ? urlFor(draft.logoKey) : null}
                onSelect={(file) => {
                  void media.upload("logo", file).then((r) => {
                    if (!r) return;
                    if (r.url) setFreshUrls((m) => ({ ...m, [r.key]: r.url! }));
                    patch({ logoKey: r.key });
                  });
                }}
                onClear={() => patch({ logoKey: null })}
                onReject={(reason) => setMessage(t(`mediaReject.${reason}`))}
                busy={media.busy}
                label={t("settingsLogo")}
                hint={t("settingsLogoHint")}
                chooseText={t("settingsImageChoose")}
                replaceText={t("settingsImageReplace")}
                removeText={t("settingsImageRemove")}
              />

              <div className="border-t border-[var(--color-border)] pt-6">
                <p className="type-body-medium font-semibold">
                  {t("settingsPortfolio")}
                </p>
                <p className="type-caption mt-0.5 mb-4 text-[var(--color-muted-foreground)]">
                  {t("settingsPortfolioHint")}
                </p>
                <GalleryUpload
                  urls={draft.photoKeys
                    .map(urlFor)
                    .filter((u): u is string => u !== null)}
                  onSelect={(files) => {
                    void media.uploadMany("photo", files).then((results) => {
                      if (results.length === 0) return;
                      setFreshUrls((m) => {
                        const next = { ...m };
                        for (const r of results) if (r.url) next[r.key] = r.url;
                        return next;
                      });
                      patch({
                        photoKeys: [
                          ...draft.photoKeys,
                          ...results.map((r) => r.key),
                        ],
                      });
                    });
                  }}
                  onRemoveUrl={(url) =>
                    patch({
                      photoKeys: draft.photoKeys.filter(
                        (k) => urlFor(k) !== url,
                      ),
                    })
                  }
                  onReject={(reason) => setMessage(t(`mediaReject.${reason}`))}
                  busy={media.busy}
                  max={MAX_PORTFOLIO_IMAGES}
                  addText={t("settingsImageAdd")}
                  emptyText={t("settingsPortfolioEmpty")}
                  fullText={t("settingsPortfolioFull", {
                    max: MAX_PORTFOLIO_IMAGES,
                  })}
                  removeText={t("settingsImageRemove")}
                />
              </div>

              {media.errorKey && (
                <p className="type-caption text-[var(--color-destructive)]">
                  {t(media.errorKey)}
                </p>
              )}
            </div>
          </Section>

          <Section
            id="identity"
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
            id="address"
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

          {/* Everything the wizard let someone skip, finishable here — and the only
          screen a rejection has to appear on. */}
          <Section
            id="documents"
            icon={<ShieldCheck className="h-5 w-5" />}
            title={t("settingsDocuments")}
            blurb={t("settingsDocumentsBlurb")}
          >
            <DocumentsSection
              providerId={activeProvider.id}
              providerType={
                (detail?.type ?? ProviderType.Individual) as ProviderType
              }
              documents={detail?.documents ?? []}
              reverificationRequestedAt={
                detail?.reverificationRequestedAt ?? null
              }
              onUploaded={() => void refetch()}
            />
          </Section>

          <Section
            id="danger"
            icon={
              <AlertTriangle className="h-5 w-5 text-[var(--color-destructive)]" />
            }
            title={t("dangerZone")}
            blurb={t("deactivateWarning")}
            tone="danger"
          >
            <Button variant="destructive" onClick={() => void deactivate()}>
              {t("deactivate")}
            </Button>
          </Section>
        </div>
      </div>

      {/* Sticky inside the scrolling content, not fixed to the viewport.
          Fixed spanned the whole window and laid itself over the foot of the
          sidebar, hiding the account menu — and raising its z-index would only
          have swapped which of the two covered the other. The bar belongs to
          the column it saves, so it lives there and ends where that column
          does. The negative margins cancel `main`'s padding so it still reads
          as a bar rather than a card footer, and the negative `bottom`
          cancels its bottom padding so the bar sits flush instead of floating
          24px clear of the edge.

          Present whether or not anything changed: a save bar that appears only
          when dirty moves the page under the reader at the moment they edit
          their first field. */}
      <div className="sticky -bottom-6 z-20 -mx-6 -mb-6 mt-6 border-t border-[var(--color-border)] bg-[var(--color-background)]/95 px-6 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3.5">
          <div className="min-w-0">
            <p className="type-body-medium font-semibold">
              {dirty
                ? t("settingsUnsaved")
                : (message ?? t("settingsNoChanges"))}
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
            <Button
              disabled={!dirty || updateMut.isPending}
              onClick={() => void save()}
            >
              {updateMut.isPending ? t("settingsSaving") : t("settingsSave")}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

/** A value nobody can change, shown as one. */
function Fact({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="type-caption text-[var(--color-muted-foreground)]">
        {label}
      </dt>
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
  id,
  icon,
  title,
  blurb,
  tone,
  children,
}: {
  id: string;
  icon: React.ReactNode;
  title: string;
  blurb: string;
  tone?: "danger";
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      // Anchored links land under the sticky page header without this.
      className={cn(
        "mt-5 scroll-mt-6 rounded-[var(--radius-card)] border p-6",
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
          <p className="type-body mt-1 text-[var(--color-muted-foreground)]">
            {blurb}
          </p>
        </div>
      </div>
      {children}
    </section>
  );
}
