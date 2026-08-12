import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { addDays, weekdayOf } from "@ntizo/shared/datetime";
import { Loader2 } from "lucide-react";
import { Button, ChoiceChips, Input, Select, type SelectOption } from "@ntizo/frontend-ui";
import { usePageHeader } from "@/shared/lib/page-header";
import { useActiveProvider } from "@/features/provider/viewmodel/use-active-provider";
import { useCurrentUser } from "@/features/user/viewmodel/use-current-user";
import {
  availabilityErrorMessage,
  canEditMember,
  canManageWorkspace,
  isIndividualProvider,
} from "../domain/types";
import { useAvailabilityConfig, useSetProviderTimezone } from "../viewmodel/use-availability";
import { WeekEditor } from "./week-editor";
import { ExceptionsPanel } from "./exceptions-panel";
import { ClosuresPanel } from "./closures-panel";
import { WeekPreview } from "./week-preview";
import { mergeWeeks, previewWeek, weekDates } from "../domain/preview";

/**
 * A provider's availability: when they (or, for an organization, each
 * member) work, the dates that break the pattern, and — for whoever runs the
 * whole workspace — its house closures and timezone.
 *
 * The person picker only exists for an organization. An individual provider
 * has exactly one member — themselves — and `availability.config` says so
 * (`members.length === 1`): there is nothing to pick between, and the word
 * "staff" never has a reason to appear on this screen for them.
 */
export function AvailabilityPage() {
  const { t, i18n } = useTranslation("provider");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const { activeProvider } = useActiveProvider();
  const query = useAvailabilityConfig(activeProvider?.id);
  const currentUser = useCurrentUser();

  usePageHeader(t("nav.availability"), activeProvider?.name);

  const [mondayIso, setMondayIso] = useState<string>(() => thisMonday());
  const [scope, setScope] = useState<"member" | "team">("member");
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

  const config = query.data;

  // Seeded once, the moment the config and the caller's own id are both
  // known — never re-run once a selection exists, so switching people is the
  // only thing that changes it, not a background refetch of the same list.
  const currentUserId = currentUser.data?.id ?? null;
  useEffect(() => {
    if (selectedMemberId !== null || !config) return;
    const self = currentUserId ? config.members.find((m) => m.userId === currentUserId) : undefined;
    const fallback = self ?? config.members[0];
    if (fallback) setSelectedMemberId(fallback.memberId);
  }, [config, currentUserId, selectedMemberId]);

  if (!activeProvider) return null;

  if (query.isLoading) {
    return (
      <div className="flex items-center gap-2 text-[var(--color-muted-foreground)]">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="type-body">{t("availabilityLoading")}</span>
      </div>
    );
  }

  if (query.error || !config) {
    return (
      <p className="type-body text-[var(--color-destructive)]">
        {availabilityErrorMessage(query.error, t)}
      </p>
    );
  }

  const selectedMember = config.members.find((m) => m.memberId === selectedMemberId) ?? null;
  const showPersonPicker = !isIndividualProvider(config);
  const canManage = canManageWorkspace(activeProvider.role);

  const memberOptions: SelectOption[] = config.members.map((m) => ({
    value: m.memberId,
    label: m.name ?? m.userId,
    hint: t(`peopleRoles.${m.role}`, { defaultValue: m.role }),
  }));

  const dates = weekDates(mondayIso);
  // The team view is the union of everyone's working time — when the business
  // is reachable at all. It never appears for a one-member workspace, where
  // it would offer a single choice and the word for "staff" must not reach
  // that provider's screen.
  const previewDays =
    showPersonPicker && scope === "team"
      ? mergeWeeks(
          config.members.map((m) =>
            previewWeek({ dates, weekly: m.weekly, exceptions: m.exceptions, closures: config.closures }),
          ),
        )
      : selectedMember
        ? previewWeek({
            dates,
            weekly: selectedMember.weekly,
            exceptions: selectedMember.exceptions,
            closures: config.closures,
          })
        : [];

  return (
    <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] lg:items-start">
      {/* The preview comes first in the DOM below `lg`, because on a phone the
          answer matters more than the controls that produced it. */}
      <div className="order-first grid gap-3 lg:order-last lg:sticky lg:top-4">
        {showPersonPicker && (
          <ChoiceChips
            name="availability-preview-scope"
            legend={t("availabilityPreviewScope")}
            options={[
              { value: "member", label: selectedMember?.name ?? t("availabilityPreviewScopeMember") },
              { value: "team", label: t("availabilityPreviewScopeTeam") },
            ]}
            value={scope}
            onChange={(v) => setScope(v as "member" | "team")}
          />
        )}
        <WeekPreview
          days={previewDays}
          weekLabel={weekLabel(mondayIso, locale)}
          onPreviousWeek={() => setMondayIso((d) => addDays(d, -7))}
          onNextWeek={() => setMondayIso((d) => addDays(d, 7))}
          onToday={() => setMondayIso(thisMonday())}
          locale={locale}
        />
      </div>

      <div className="flex min-w-0 flex-col gap-8">
      {showPersonPicker && (
        <div className="grid max-w-xs gap-1.5">
          <span className="type-caption font-bold tracking-[0.14em] text-[var(--color-muted-foreground)] uppercase">
            {t("availabilityMember")}
          </span>
          <Select
            value={selectedMemberId ?? ""}
            onChange={setSelectedMemberId}
            options={memberOptions}
            ariaLabel={t("availabilityMember")}
          />
        </div>
      )}

      {selectedMember && (
        <section className="grid gap-3">
          <div>
            <h2 className="type-h3 font-semibold">{t("availabilityWeekTitle")}</h2>
            <p className="type-body text-[var(--color-muted-foreground)]">{t("availabilityWeekHint")}</p>
          </div>
          <WeekEditor
            providerId={activeProvider.id}
            member={selectedMember}
            canEdit={canEditMember(selectedMember, {
              role: activeProvider.role,
              currentUserId,
            })}
          />
        </section>
      )}

      {selectedMember && (
        <section className="grid gap-3">
          <div>
            <h2 className="type-h3 font-semibold">{t("availabilityExceptionsTitle")}</h2>
            <p className="type-body text-[var(--color-muted-foreground)]">
              {t("availabilityExceptionsHint")}
            </p>
          </div>
          <ExceptionsPanel
            providerId={activeProvider.id}
            member={selectedMember}
            canEdit={canEditMember(selectedMember, {
              role: activeProvider.role,
              currentUserId,
            })}
          />
        </section>
      )}

      {/* Closures and the timezone govern the whole workspace, not one
          member's own calendar — visible only to whoever runs it. Hiding
          these is not the guard: `availability.addClosure`,
          `removeClosure` and `provider.update`'s timezone field all refuse a
          caller who is neither the owner nor an admin regardless of what
          this screen shows. */}
      {canManage && (
        <section className="grid gap-3">
          <div>
            <h2 className="type-h3 font-semibold">{t("availabilityTimezoneTitle")}</h2>
            <p className="type-body text-[var(--color-muted-foreground)]">
              {t("availabilityTimezoneHint")}
            </p>
          </div>
          <TimezoneField
            key={activeProvider.id}
            providerId={activeProvider.id}
            timezone={config.timezone}
          />
        </section>
      )}

      {canManage && (
        <section className="grid gap-3">
          <div>
            <h2 className="type-h3 font-semibold">{t("availabilityClosuresTitle")}</h2>
            <p className="type-body text-[var(--color-muted-foreground)]">
              {t("availabilityClosuresHint")}
            </p>
          </div>
          <ClosuresPanel providerId={activeProvider.id} closures={config.closures} />
        </section>
      )}
      </div>
    </div>
  );
}

/**
 * The workspace's own timezone, set through `provider.update`.
 *
 * The draft is seeded once from `timezone` at mount and never re-synced
 * afterwards — a background refetch of `availability.config` (triggered by,
 * say, adding an exception below) must not overwrite what somebody is
 * mid-typing here. The parent gives this a `key={activeProvider.id}` so
 * switching workspace remounts it with the new provider's own value instead
 * of leaving the previous one's text behind.
 */
function TimezoneField({ providerId, timezone }: { providerId: string; timezone: string }) {
  const { t } = useTranslation("provider");
  const mutation = useSetProviderTimezone(providerId);
  const [value, setValue] = useState(timezone);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    try {
      await mutation.mutateAsync(value.trim());
    } catch (e) {
      setError(availabilityErrorMessage(e, t));
    }
  }

  return (
    <div className="grid gap-2">
      <div className="grid gap-2 sm:flex sm:items-end sm:gap-3">
        <div className="grid w-full gap-1.5 sm:w-64">
          <label
            htmlFor="provider-timezone"
            className="type-caption font-semibold text-[var(--color-muted-foreground)]"
          >
            {t("availabilityTimezoneTitle")}
          </label>
          <Input
            id="provider-timezone"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              mutation.reset();
            }}
            placeholder="Africa/Maputo"
          />
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={mutation.isPending || value.trim() === "" || value.trim() === timezone}
          onClick={() => void save()}
        >
          {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("availabilityTimezoneSave")}
        </Button>
        {mutation.isSuccess && !error && (
          <span className="type-caption text-[var(--color-muted-foreground)]">
            {t("availabilityTimezoneSaved")}
          </span>
        )}
      </div>
      {error && <p className="type-caption text-[var(--color-destructive)]">{error}</p>}
    </div>
  );
}

/** The Monday of the current week, as a civil date. */
function thisMonday(): string {
  const today = new Date().toISOString().slice(0, 10);
  const w = weekdayOf(today);
  // `weekdayOf` is 0 = Sunday, so Sunday is six days after its Monday.
  return addDays(today, w === 0 ? -6 : 1 - w);
}

/** "10 – 16 August 2026", in the reader's own language. */
function weekLabel(mondayIso: string, locale: string): string {
  const fmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", timeZone: "UTC" });
  const end = addDays(mondayIso, 6);
  const asDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
  const year = new Intl.DateTimeFormat(locale, { year: "numeric", timeZone: "UTC" }).format(asDate(end));
  return `${fmt.format(asDate(mondayIso))} – ${fmt.format(asDate(end))} ${year}`;
}
