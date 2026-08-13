import { useState } from "react";
import { useTranslation } from "react-i18next";
import { addDays } from "@ntizo/shared/datetime";
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Info, Loader2 } from "lucide-react";
import { Button, Input, Select } from "@ntizo/frontend-ui";
import { usePageHeader } from "@/shared/lib/page-header";
import { useActiveProvider } from "@/features/provider/viewmodel/use-active-provider";
import { useCurrentUser } from "@/features/user/viewmodel/use-current-user";
import type { ProviderSummary } from "@/features/provider/domain/types";
import { useServices } from "@/features/provider/services/viewmodel/use-services";
import { defaultOption, ownerName } from "@/features/provider/services/domain/types";
import {
  availabilityErrorMessage,
  canEditMember,
  canManageWorkspace,
  isIndividualProvider,
  type AvailabilityConfig,
  type AvailabilityMember,
  type WeeklyRuleDraft,
} from "../domain/types";
import {
  WEEKDAY_ORDER,
  compareRules,
  formatDayList,
  formatHours,
  patternMinutes,
} from "../domain/week";
import { busiestDay, weekTotals } from "../domain/grid";
import { mondayOf, nowInZone } from "../domain/clock";
import { offerFromOption, previewSlots } from "../domain/slot-preview";
import {
  useAvailabilityConfig,
  useSetProviderTimezone,
  useSetWeeklyPattern,
} from "../viewmodel/use-availability";
import { Segmented } from "./segmented";
import { AvailabilitySkeleton } from "./availability-skeleton";
import { PeoplePicker } from "./people-picker";
import { WeekRules } from "./week-rules";
import { ExceptionsPanel } from "./exceptions-panel";
import { ClosuresPanel } from "./closures-panel";
import { WeekPreview, type PreviewDensity } from "./week-preview";
import { mergeWeeks, previewWeek, weekDates } from "../domain/preview";

/**
 * A provider's availability, built around one idea: the week is the page.
 *
 * The screen this replaces asked its questions in four stacked sections, each
 * with a heading and a paragraph, and drew the answer in a corner. Two of those
 * sections were forms held permanently open for things done twice a year, one
 * was a text field for a value that changes once in a workspace's life, and the
 * picture itself was an eighteen-row grid whose last three days were behind a
 * sideways scroll.
 *
 * So: the week and what it adds up to come first, everything that changes it
 * shrinks to a control beside it, and nothing claims to be pending work unless
 * it is. The engine is untouched — `previewWeek` still delegates the precedence
 * chain to `@ntizo/shared/scheduling`, which is the same code that answers a
 * customer.
 *
 * The person picker only exists for an organization. An individual provider has
 * exactly one member — themselves — and `availability.config` says so: there is
 * nothing to pick between, and the word "staff" never has a reason to appear on
 * their screen.
 */
export function AvailabilityPage() {
  const { t } = useTranslation("provider");
  const { activeProvider } = useActiveProvider();
  const query = useAvailabilityConfig(activeProvider?.id);
  const currentUser = useCurrentUser();

  usePageHeader(t("nav.availability"), activeProvider?.name);

  if (!activeProvider) return null;

  // The page's own shape while the config is in flight, rather than a spinner
  // on a blank screen — see `AvailabilitySkeleton` for why.
  if (query.isLoading) return <AvailabilitySkeleton />;

  if (query.error || !query.data) {
    return (
      <p className="type-body text-[var(--color-destructive)]">
        {availabilityErrorMessage(query.error, t)}
      </p>
    );
  }

  // Everything below this line needs the configuration to exist, and hooks
  // cannot live behind the three returns above. Keyed on the workspace so
  // switching to another one starts from its own week rather than leaving the
  // previous workspace's selection, draft and timezone text behind.
  return (
    <AvailabilityBoard
      key={activeProvider.id}
      provider={activeProvider}
      config={query.data}
      currentUserId={currentUser.data?.id ?? null}
    />
  );
}

/** `"team"`, or a `provider_member.id`. */
type Scope = string;
const TEAM: Scope = "team";

function AvailabilityBoard({
  provider,
  config,
  currentUserId,
}: {
  provider: ProviderSummary;
  config: AvailabilityConfig;
  currentUserId: string | null;
}) {
  const { t, i18n } = useTranslation("provider");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const saveWeek = useSetWeeklyPattern(provider.id);

  /**
   * Now, and the week it falls in, read in the *workspace's* zone.
   *
   * Every date on this screen is a civil date in that zone, so an admin in
   * Lisbon opening a Maputo workspace late on a Sunday evening must still land
   * on Maputo's week, not on the one their own laptop is already in.
   */
  const now = nowInZone(config.timezone);
  /** Falls back to the browser's own civil date only when the zone is unresolvable. */
  const todayIso = now?.date ?? new Date().toISOString().slice(0, 10);
  const [mondayIso, setMondayIso] = useState<string>(() => mondayOf(todayIso));
  const [saveError, setSaveError] = useState<string | null>(null);
  const [density, setDensity] = useState<PreviewDensity>("hours");

  /**
   * Who the week belongs to — one control, not two.
   *
   * The previous screen asked this twice: a `Select` of people in one column
   * decided whose rules were being edited, and a separate pair of chips in the
   * other decided whose week was drawn. Two controls, in two places, for one
   * question, which could disagree with each other.
   */
  const [scope, setScope] = useState<Scope>(
    () =>
      (currentUserId ? config.members.find((m) => m.userId === currentUserId) : undefined)
        ?.memberId ??
      config.members[0]?.memberId ??
      TEAM,
  );

  const selectedMemberId = scope === TEAM ? null : scope;
  const selectedMember = config.members.find((m) => m.memberId === selectedMemberId) ?? null;

  /**
   * The week under edit, seeded from the fetched value when the *selected
   * member* changes and never re-synced after that.
   *
   * `availability.config` is invalidated by every mutation on this screen — an
   * exception added below, a closure removed by somebody else — and re-running
   * this seed on each of those background refetches would discard whatever week
   * is mid-edit. That is the exact trap this project has already shipped once,
   * in the services form, which is why the seed is triggered by the member's id
   * changing and by nothing else.
   *
   * Adjusted during render rather than in an effect — React's own answer for
   * state derived from a changing input. An effect would paint one frame of "No
   * hours set" over a member who has a full week, every time the selection
   * changed.
   */
  const [draft, setDraft] = useState<WeeklyRuleDraft[]>(() => toDraft(selectedMember?.weekly ?? []));
  const [seededFor, setSeededFor] = useState<string | null>(selectedMemberId);
  if (seededFor !== selectedMemberId) {
    setSeededFor(selectedMemberId);
    setDraft(toDraft(selectedMember?.weekly ?? []));
    setSaveError(null);
  }

  const showPeople = !isIndividualProvider(config);
  const canManage = canManageWorkspace(provider.role);
  const canEditSelected =
    selectedMember !== null && canEditMember(selectedMember, { role: provider.role, currentUserId });

  const dates = weekDates(mondayIso);
  /** The draft for whoever is selected, the fetched value for everybody else. */
  const weekOf = (member: AvailabilityMember) =>
    previewWeek({
      dates,
      weekly: member.memberId === selectedMemberId ? draft : member.weekly,
      exceptions: member.exceptions,
      closures: config.closures,
    });

  // The team view is the union of everyone's working time — when the business
  // is reachable at all. It never appears for a one-member workspace, where it
  // would offer a single choice and the word for "staff" must not reach that
  // provider's screen.
  const previewDays =
    scope === TEAM
      ? mergeWeeks(config.members.map(weekOf))
      : selectedMember
        ? weekOf(selectedMember)
        : [];

  const totals = weekTotals(previewDays);
  const busiest = busiestDay(previewDays);
  const workingWeekdays = WEEKDAY_ORDER.filter((w) =>
    previewDays.some((d) => d.weekday === w && d.intervals.length > 0),
  );

  /**
   * What the *usual* week is worth, against what this one turned out to be.
   *
   * The old screen printed the second number alone, which left a provider to
   * work out for themselves why a week they had set as 44 hours was reading 38.
   * Both numbers together name the cause without naming it: the difference is
   * exactly what the closures and exceptions below took out.
   *
   * Summed across everybody in the team view, because that view's own total is
   * summed the same way.
   */
  const pattern =
    scope === TEAM
      ? config.members.reduce((sum, m) => sum + patternMinutes(m.weekly), 0)
      : patternMinutes(draft);
  const delta = totals.totalMinutes - pattern;

  /** Only marks a day inside the week actually on screen. */
  const nowThisWeek = now && dates.includes(now.date) ? now : null;

  /**
   * What the *selected member's* rules would actually sell, for one service.
   *
   * Duration lives on the service option, not on a rule, so a preview needs a
   * service to be exact — there is no default length to fall back to that would
   * not draw slots the provider does not sell. Scoped to a real member: the team
   * view is a union of different people's windows with no single capacity to
   * report a seat count for, which is a booking-flow question (concurrent staff)
   * this task deliberately leaves alone.
   */
  const servicesQuery = useServices(provider.id);
  const publishedServices = (servicesQuery.data ?? []).filter((s) => s.status === "published");
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const activeService =
    publishedServices.find((s) => s.id === selectedServiceId) ?? publishedServices[0] ?? null;
  const activeOption = activeService ? defaultOption(activeService) : null;
  const offer = activeOption ? offerFromOption(activeOption) : null;

  const slotPreview =
    selectedMember && offer
      ? previewSlots({
          dates,
          rules: draft,
          exceptions: selectedMember.exceptions,
          closures: config.closures,
          offer,
        })
      : null;

  // Only a member's own week is a draft; the team view is read-only, and
  // exceptions and closures write immediately through their own mutations.
  const dirty = selectedMember !== null && !sameRules(draft, toDraft(selectedMember.weekly));

  async function save() {
    if (!selectedMemberId) return;
    setSaveError(null);
    try {
      await saveWeek.mutateAsync({ memberId: selectedMemberId, rules: [...draft] });
    } catch (e) {
      setSaveError(availabilityErrorMessage(e, t));
    }
  }

  return (
    <div className="mx-auto grid w-full max-w-[86rem] gap-3">
      {/* Context and scope. The timezone was a section with a heading, a
          paragraph, a field and a button, for a value that changes once in a
          workspace's life; here it is a line that opens a field when asked. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5">
        {/* `min-w-0 flex-1`: the picker scrolls sideways within itself, but a
            flex item defaults to `min-width: auto` and would refuse to shrink
            below its content, pushing the whole strip past the viewport. */}
        {showPeople ? (
          <div className="min-w-0 flex-1">
          <PeoplePicker
            ariaLabel={t("availabilityScopeLegend")}
            value={scope}
            onChange={setScope}
            people={config.members.map((m) => ({
              value: m.memberId,
              // `||`, not `??`: a member who signed up without a display name
              // carries `""` rather than `null`, and an empty pill with an
              // initials badge reading "?" is worse than the raw id.
              name: m.name?.trim() || m.userId,
              // The same three names the People page prints, from the same
              // key — a member whose role reads "Owner" there must not read
              // "owner" here.
              role: t(`peopleRoles.${m.role}`, { defaultValue: m.role }),
            }))}
            team={{
              value: TEAM,
              label: t("availabilityPreviewScopeTeam"),
              hint: t("availabilityTeamHint"),
            }}
          />
          </div>
        ) : (
          <TimezoneContext
            providerId={provider.id}
            timezone={config.timezone}
            canManage={canManage}
          />
        )}

        {/* Full width on a phone, where it is its own row and the date label is
            the widest thing on the page; auto beside the picker above `sm`. */}
        <div className="flex w-full items-center gap-1.5 sm:ml-auto sm:w-auto">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setMondayIso((d) => addDays(d, -7))}
            aria-label={t("availabilityPreviousWeek")}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            // `title`, not `aria-label`: an accessible name of "Today" would
            // replace the date range this button *is*, leaving a screen-reader
            // user with no way to hear which week they are looking at.
            title={t("availabilityToday")}
            onClick={() => setMondayIso(mondayOf(todayIso))}
            className="min-w-0 flex-1 truncate tabular-nums sm:flex-none"
          >
            {weekLabel(mondayIso, locale)}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setMondayIso((d) => addDays(d, 7))}
            aria-label={t("availabilityNextWeek")}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* The timezone keeps its own line once the people picker has taken the
          strip above — two unrelated controls sharing one row read as a pair. */}
      {showPeople && (
        <div className="px-1">
          <TimezoneContext
            providerId={provider.id}
            timezone={config.timezone}
            canManage={canManage}
          />
        </div>
      )}

      {/* The answer, before the drawing. "How much work is this" is the question
          people bring to this page, and the old screen answered it only by
          making them count rectangles. */}
      <div className="flex flex-wrap items-center gap-x-7 gap-y-3 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-muted)] px-5 py-4">
        <div className="grid gap-0.5">
          <p className="font-rounded text-[1.75rem] leading-none font-semibold tracking-[-0.03em] tabular-nums">
            {totals.totalMinutes > 0
              ? t("availabilityWeekTotalLine", {
                  total: formatHours(totals.totalMinutes, locale),
                })
              : t("availabilityNothingThisWeek")}
          </p>
          {workingWeekdays.length > 0 && (
            <p className="type-caption text-[var(--color-muted-foreground)]">
              {formatDayList(locale, workingWeekdays, "long")}
            </p>
          )}
        </div>

        {busiest && (
          <div className="grid gap-0.5">
            <p className="type-body-medium font-semibold tabular-nums">
              {formatDayList(locale, [busiest.day.weekday])} ·{" "}
              {formatHours(busiest.minutes, locale)}
            </p>
            <p className="type-caption text-[var(--color-muted-foreground)]">
              {t("availabilityBusiestDay")}
            </p>
          </div>
        )}

        {/* Nothing to compare against on a week with no pattern at all — a
            "0 hours less than usual" on a brand-new workspace is noise. */}
        {pattern > 0 && (
          <p
            className={`type-caption ml-auto inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium ${
              delta === 0
                ? "border-[color-mix(in_srgb,var(--color-success)_30%,transparent)] bg-[color-mix(in_srgb,var(--color-success)_10%,transparent)] text-[color-mix(in_srgb,var(--color-success)_65%,var(--color-foreground))]"
                : "border-[color-mix(in_srgb,var(--color-warning)_34%,transparent)] bg-[color-mix(in_srgb,var(--color-warning)_14%,transparent)] text-[color-mix(in_srgb,var(--color-warning)_60%,var(--color-foreground))]"
            }`}
          >
            {delta === 0 ? (
              <>
                <Check aria-hidden="true" className="h-3.5 w-3.5" />
                {t("availabilitySamePattern")}
              </>
            ) : (
              <>
                <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5" />
                {t("availabilityVsPattern", {
                  delta: `${delta < 0 ? "−" : "+"}${formatHours(Math.abs(delta), locale)}`,
                  pattern: formatHours(pattern, locale),
                })}
              </>
            )}
          </p>
        )}
      </div>

      <div className="grid gap-3 lg:grid-cols-[21rem_minmax(0,1fr)] lg:items-start">
        {/* The week comes first in the DOM below `lg`: on a phone the answer
            matters more than the controls that produced it. */}
        <div className="order-first grid gap-3 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-background)] p-3 lg:order-last lg:p-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {selectedMember &&
              (publishedServices.length > 0 ? (
                <>
                  <label
                    htmlFor="availability-preview-service"
                    className="type-caption text-[var(--color-muted-foreground)]"
                  >
                    {t("availabilityPreviewFor")}
                  </label>
                  <Select
                    id="availability-preview-service"
                    value={activeService?.id ?? ""}
                    onChange={setSelectedServiceId}
                    options={publishedServices.map((s) => ({
                      value: s.id,
                      label: ownerName(s, locale),
                    }))}
                    triggerClassName="type-caption inline-flex h-8 items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-background)] px-3"
                  />
                  {slotPreview && (
                    <p className="type-caption text-[var(--color-muted-foreground)]">
                      {t("availabilityPreviewCount", {
                        slots: slotPreview.totalSlots,
                        seats: slotPreview.totalSeats,
                      })}
                    </p>
                  )}
                </>
              ) : (
                <p className="type-caption text-[var(--color-muted-foreground)]">
                  {t("availabilityPreviewNoService")}
                </p>
              ))}

            {/* Offered only when there is something to reveal. Without a
                service there are no starts to draw, and a toggle whose other
                position changes nothing is a control that teaches people it
                does nothing. */}
            {slotPreview && slotPreview.totalSlots > 0 && (
              <div className="ml-auto">
                <Segmented
                  ariaLabel={t("availabilityDensityLegend")}
                  value={density}
                  onChange={setDensity}
                  options={[
                    { value: "hours", label: t("availabilityDensityHours") },
                    { value: "slots", label: t("availabilityDensitySlots") },
                  ]}
                />
              </div>
            )}
          </div>

          <WeekPreview
            days={previewDays}
            locale={locale}
            slotsByDate={slotPreview?.byDate}
            density={density}
            now={nowThisWeek}
          />
        </div>

        {/* `@container`, so the forms inside measure themselves against this
            pane rather than against the viewport. A `sm:` breakpoint here is a
            lie: the window is wide, the column is not, and a two-column form in
            300px overflowed its own panel. */}
        <div className="@container grid content-start gap-3">
          {selectedMember && (
            <Panel title={t("availabilityWeekTitle")}>
              {/* Keyed on the member so a switch clears the previous person's
                  open drawer along with the draft above. */}
              <WeekRules
                key={selectedMember.memberId}
                canEdit={canEditSelected}
                locale={locale}
                rules={draft}
                onChange={(next) => {
                  setDraft(next);
                  setSaveError(null);
                }}
              />
            </Panel>
          )}

          {/* Nothing on this rail is editable in the team view — it is a union
              of several people's weeks, and there is no single member's rules
              underneath it to change. Saying so beats three panels that quietly
              disappear. */}
          {!selectedMember && (
            <Note>{t("availabilityTeamNote")}</Note>
          )}

          {selectedMember && (
            <Panel title={t("availabilityExceptionsTitle")}>
              <ExceptionsPanel
                providerId={provider.id}
                member={selectedMember}
                canEdit={canEditSelected}
              />
            </Panel>
          )}

          {/* Closures govern the whole workspace, not one member's calendar —
              visible only to whoever runs it. Hiding this is not the guard:
              `availability.addClosure` and `removeClosure` refuse a caller who
              is neither owner nor admin regardless of what this screen shows. */}
          {canManage && (
            <Panel title={t("availabilityClosuresTitle")}>
              <ClosuresPanel providerId={provider.id} closures={config.closures} />
              <Note>{t("availabilityClosurePrecedence")}</Note>
            </Panel>
          )}
        </div>
      </div>

      {/* Only when there is something to save. A button that is always there
          asserts there is always pending work, which trains people to ignore
          it — and then to miss the once it mattered. Tinted, so it reads as a
          state the page is in rather than as another row of furniture. */}
      {dirty && (
        <div className="sticky bottom-0 z-20 -mx-1 flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] border border-[color-mix(in_srgb,var(--color-primary)_22%,var(--color-border))] bg-[color-mix(in_srgb,var(--color-primary)_5%,var(--color-background))] px-4 py-3 shadow-[0_-2px_12px_-6px_rgba(19,23,27,0.25)] backdrop-blur">
          <p
            className={
              saveError
                ? "type-caption mr-auto text-[var(--color-destructive)]"
                : "type-caption mr-auto text-[var(--color-foreground)]"
            }
          >
            {saveError ?? t("availabilityUnsaved")}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={saveWeek.isPending}
            onClick={() => {
              setDraft(toDraft(selectedMember?.weekly ?? []));
              setSaveError(null);
            }}
          >
            {t("availabilityDiscard")}
          </Button>
          <Button type="button" size="sm" disabled={saveWeek.isPending} onClick={() => void save()}>
            {saveWeek.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("availabilitySave")}
          </Button>
        </div>
      )}
    </div>
  );
}

/** One titled section of the control rail. */
function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-3 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-background)] p-3 lg:p-4">
      <h2 className="type-caption font-bold tracking-[0.14em] text-[var(--color-muted-foreground)] uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="type-caption flex gap-2 rounded-[var(--radius-card-sm)] border border-[color-mix(in_srgb,var(--color-primary)_16%,transparent)] bg-[var(--color-muted)] px-3 py-2.5 text-[var(--color-muted-foreground)]">
      <Info aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-primary)]" />
      {children}
    </p>
  );
}

/**
 * The fetched week as the form edits it: id-less rows, in canonical order — and
 * carrying each rule's own buffer, grid and capacity, not just its hours.
 *
 * `setWeeklyPattern` replaces a member's whole week in one call. Dropping the
 * shape fields here would mean every rule the provider did *not* touch this
 * session still gets resubmitted — as `{weekday, startMinute, endMinute}` alone
 * once `save()` sends `draft` back — and the server reads a shape-less row as
 * "use the default", silently erasing whatever that rule's buffer, grid or
 * capacity used to be.
 */
function toDraft(weekly: AvailabilityMember["weekly"]): WeeklyRuleDraft[] {
  return weekly
    .map(({ weekday, startMinute, endMinute, bufferMinutes, slotIntervalMinutes, capacity }) => ({
      weekday,
      startMinute,
      endMinute,
      bufferMinutes,
      slotIntervalMinutes,
      capacity,
    }))
    .sort(compareRules);
}

/**
 * Whether two canonically-ordered drafts describe the same week.
 *
 * Field by field rather than by `JSON.stringify`: key order is not part of what
 * makes two weeks equal, and a serialiser that happened to emit a different
 * order would report a clean week as unsaved.
 *
 * Compares the shape fields too, not just hours — editing only a rule's
 * capacity through the drawer, with its days and times untouched, is still a
 * real change, and the save bar above the week has no other signal to raise on.
 */
function sameRules(a: readonly WeeklyRuleDraft[], b: readonly WeeklyRuleDraft[]): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (rule, i) =>
      rule.weekday === b[i]!.weekday &&
      rule.startMinute === b[i]!.startMinute &&
      rule.endMinute === b[i]!.endMinute &&
      rule.bufferMinutes === b[i]!.bufferMinutes &&
      rule.slotIntervalMinutes === b[i]!.slotIntervalMinutes &&
      rule.capacity === b[i]!.capacity,
  );
}

/** The workspace's timezone: editable for whoever runs it, a fact for everyone else. */
function TimezoneContext({
  providerId,
  timezone,
  canManage,
}: {
  providerId: string;
  timezone: string;
  canManage: boolean;
}) {
  const { t } = useTranslation("provider");
  if (canManage) return <TimezoneLine providerId={providerId} timezone={timezone} />;
  return (
    <p className="type-caption text-[var(--color-muted-foreground)]">
      {t("availabilityTimezoneTitle")}{" "}
      <b className="font-medium text-[var(--color-foreground)]">{timezone}</b>
    </p>
  );
}

/**
 * The workspace's own timezone, as a line of context that opens a field.
 *
 * The draft is seeded when the field opens and never re-synced afterwards — a
 * background refetch of `availability.config` (triggered by, say, adding an
 * exception) must not overwrite what somebody is mid-typing.
 */
function TimezoneLine({ providerId, timezone }: { providerId: string; timezone: string }) {
  const { t } = useTranslation("provider");
  const mutation = useSetProviderTimezone(providerId);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(timezone);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    try {
      await mutation.mutateAsync(value.trim());
      setEditing(false);
    } catch (e) {
      setError(availabilityErrorMessage(e, t));
    }
  }

  if (!editing) {
    return (
      <p className="type-caption text-[var(--color-muted-foreground)]">
        {t("availabilityTimezoneTitle")} <b className="font-semibold">{timezone}</b>{" "}
        <button
          type="button"
          onClick={() => {
            setValue(timezone);
            setError(null);
            mutation.reset();
            setEditing(true);
          }}
          className="cursor-pointer font-semibold text-[var(--color-primary)] underline-offset-2 hover:underline"
        >
          {t("availabilityTimezoneChange")}
        </button>
      </p>
    );
  }

  return (
    <div className="grid gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id="provider-timezone"
          aria-label={t("availabilityTimezoneTitle")}
          value={value}
          autoFocus
          onChange={(e) => setValue(e.target.value)}
          placeholder="Africa/Maputo"
          className="w-56"
        />
        <Button
          type="button"
          size="sm"
          disabled={mutation.isPending || value.trim() === "" || value.trim() === timezone}
          onClick={() => void save()}
        >
          {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("availabilityTimezoneSave")}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
          {t("availabilityTimezoneCancel")}
        </Button>
      </div>
      {error && <p className="type-caption text-[var(--color-destructive)]">{error}</p>}
    </div>
  );
}

/**
 * "10 – 16 August 2026", in the reader's own language — with the month named
 * once when both ends share it.
 *
 * Naming it twice produced "10 de agosto – 16 de agosto 2026" in the platform's
 * launch language, which is the widest single element on a 390px screen and on
 * its own pushed the page into a sideways scroll. A week that straddles two
 * months genuinely needs both names and still gets them.
 */
function weekLabel(mondayIso: string, locale: string): string {
  const end = addDays(mondayIso, 6);
  const asDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
  const from = asDate(mondayIso);
  const to = asDate(end);

  const year = new Intl.DateTimeFormat(locale, { year: "numeric", timeZone: "UTC" }).format(to);
  const dayOnly = new Intl.DateTimeFormat(locale, { day: "numeric", timeZone: "UTC" });
  const dayMonth = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });

  const sameMonth = mondayIso.slice(0, 7) === end.slice(0, 7);
  const left = sameMonth ? dayOnly.format(from) : dayMonth.format(from);
  return `${left} – ${dayMonth.format(to)} ${year}`;
}
