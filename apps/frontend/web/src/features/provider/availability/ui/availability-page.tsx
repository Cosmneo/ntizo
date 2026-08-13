import { useState } from "react";
import { useTranslation } from "react-i18next";
import { addDays, weekdayOf } from "@ntizo/shared/datetime";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button, Input } from "@ntizo/frontend-ui";
import { usePageHeader } from "@/shared/lib/page-header";
import { useActiveProvider } from "@/features/provider/viewmodel/use-active-provider";
import { useCurrentUser } from "@/features/user/viewmodel/use-current-user";
import type { ProviderSummary } from "@/features/provider/domain/types";
import {
  availabilityErrorMessage,
  canEditMember,
  canManageWorkspace,
  isIndividualProvider,
  type AvailabilityConfig,
  type AvailabilityMember,
  type WeeklyRuleDraft,
} from "../domain/types";
import { WEEKDAY_ORDER, compareRules, formatDayList, formatHours } from "../domain/week";
import { weekTotals } from "../domain/grid";
import {
  useAvailabilityConfig,
  useSetProviderTimezone,
  useSetWeeklyPattern,
} from "../viewmodel/use-availability";
import { Segmented } from "./segmented";
import { WeekRules } from "./week-rules";
import { ExceptionsPanel } from "./exceptions-panel";
import { ClosuresPanel } from "./closures-panel";
import { WeekPreview } from "./week-preview";
import { mergeWeeks, previewWeek, weekDates } from "../domain/preview";

/**
 * A provider's availability, built around one idea: the week is the page.
 *
 * The screen this replaces asked its questions in four stacked sections, each
 * with a heading and a paragraph, and drew the answer in a corner. Two of
 * those sections were forms held permanently open for things done twice a
 * year, one was a text field for a value that changes once in a workspace's
 * life, and the picture itself was an eighteen-row grid whose last three days
 * were behind a sideways scroll.
 *
 * So: the week and what it adds up to come first, everything that changes it
 * shrinks to a control beside it, and nothing claims to be pending work
 * unless it is. The engine is untouched — `previewWeek` still delegates the
 * precedence chain to `@ntizo/shared/scheduling`, which is the same code that
 * answers a customer.
 *
 * The person picker only exists for an organization. An individual provider
 * has exactly one member — themselves — and `availability.config` says so:
 * there is nothing to pick between, and the word "staff" never has a reason to
 * appear on their screen.
 */
export function AvailabilityPage() {
  const { t } = useTranslation("provider");
  const { activeProvider } = useActiveProvider();
  const query = useAvailabilityConfig(activeProvider?.id);
  const currentUser = useCurrentUser();

  usePageHeader(t("nav.availability"), activeProvider?.name);

  if (!activeProvider) return null;

  if (query.isLoading) {
    return (
      <div className="flex items-center gap-2 text-[var(--color-muted-foreground)]">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="type-body">{t("availabilityLoading")}</span>
      </div>
    );
  }

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

  const [mondayIso, setMondayIso] = useState<string>(() => thisMonday());
  const [saveError, setSaveError] = useState<string | null>(null);

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
   * this seed on each of those background refetches would discard whatever
   * week is mid-edit. That is the exact trap this project has already shipped
   * once, in the services form, which is why the seed is triggered by the
   * member's id changing and by nothing else.
   *
   * Adjusted during render rather than in an effect — React's own answer for
   * state derived from a changing input. An effect would paint one frame of
   * "No hours set" over a member who has a full week, every time the selection
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
  const workingWeekdays = WEEKDAY_ORDER.filter((w) =>
    previewDays.some((d) => d.weekday === w && d.intervals.length > 0),
  );

  // Only a member's own week is a draft; the team view is read-only, and
  // exceptions and closures write immediately through their own mutations.
  const dirty =
    selectedMember !== null && !sameRules(draft, toDraft(selectedMember.weekly));

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
    /* One frame with 1px divisions rather than a stack of floating cards.
       Every strip below is a band of the same panel: context, then the answer,
       then the two panes, then the bar — which is what makes the week read as
       the page rather than as one widget among several. */
    <div className="mx-auto max-w-6xl overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-background)]">
      {/* Context, not tasks. The timezone was a section with a heading, a
          paragraph, a field and a button, for a value that changes once in a
          workspace's life; here it is a line that opens a field when asked. */}
      <div className="flex flex-wrap items-center gap-x-[18px] gap-y-2.5 border-b border-[var(--color-border)] px-5 py-3.5">
        {canManage ? (
          <TimezoneLine providerId={provider.id} timezone={config.timezone} />
        ) : (
          <p className="type-caption text-[var(--color-muted-foreground)]">
            {t("availabilityTimezoneTitle")}{" "}
            <b className="font-medium text-[var(--color-foreground)]">{config.timezone}</b>
          </p>
        )}

        {showPeople && (
          <div className="ml-auto">
            <Segmented
              ariaLabel={t("availabilityScopeLegend")}
              value={scope}
              onChange={setScope}
              options={[
                ...config.members.map((m) => ({ value: m.memberId, label: m.name ?? m.userId })),
                { value: TEAM, label: t("availabilityPreviewScopeTeam") },
              ]}
            />
          </div>
        )}
      </div>

      {/* The answer, before the drawing. "How much work is this" is the
          question people bring to this page, and the old screen answered it
          only by making them count rectangles. The week navigation lives here
          too: it changes which week this number is about. */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-[var(--color-border)] bg-[var(--color-muted)] px-5 py-4">
        <p className="font-rounded text-[1.5rem] leading-none font-semibold tracking-[-0.02em] tabular-nums">
          {totals.totalMinutes > 0
            ? t("availabilityWeekTotalLine", { total: formatHours(totals.totalMinutes, locale) })
            : t("availabilityNothingThisWeek")}
        </p>
        {workingWeekdays.length > 0 && (
          <p className="type-caption text-[var(--color-muted-foreground)]">
            {formatDayList(locale, workingWeekdays, "long")}
          </p>
        )}

        <div className="ml-auto flex items-center gap-1.5">
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
            onClick={() => setMondayIso(thisMonday())}
            className="tabular-nums"
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

      <div className="grid lg:grid-cols-[340px_minmax(0,1fr)]">
        {/* The week comes first in the DOM below `lg`: on a phone the answer
            matters more than the controls that produced it. */}
        <div className="order-first border-b border-[var(--color-border)] p-5 lg:order-last lg:border-b-0">
          <WeekPreview days={previewDays} locale={locale} />
        </div>

        {/* `@container`, so the forms inside measure themselves against this
            340px pane rather than against the viewport. A `sm:` breakpoint here
            is a lie: the window is wide, the column is not, and a two-column
            form in 300px overflowed its own panel. */}
        <div className="@container grid content-start gap-[22px] border-[var(--color-border)] p-5 lg:border-r">
          {selectedMember && (
            <section className="grid gap-2.5">
              <h2 className="type-caption font-bold tracking-[0.14em] text-[var(--color-muted-foreground)] uppercase">
                {t("availabilityWeekTitle")}
              </h2>
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
            </section>
          )}

          {selectedMember && (
            <section className="grid gap-2.5">
              <h2 className="type-caption font-bold tracking-[0.14em] text-[var(--color-muted-foreground)] uppercase">
                {t("availabilityExceptionsTitle")}
              </h2>
              <ExceptionsPanel
                providerId={provider.id}
                member={selectedMember}
                canEdit={canEditSelected}
              />
            </section>
          )}

          {/* Closures govern the whole workspace, not one member's calendar —
              visible only to whoever runs it. Hiding this is not the guard:
              `availability.addClosure` and `removeClosure` refuse a caller who
              is neither owner nor admin regardless of what this screen shows. */}
          {canManage && (
            <section className="grid gap-2.5">
              <h2 className="type-caption font-bold tracking-[0.14em] text-[var(--color-muted-foreground)] uppercase">
                {t("availabilityClosuresTitle")}
              </h2>
              <ClosuresPanel providerId={provider.id} closures={config.closures} />
            </section>
          )}
        </div>
      </div>

      {/* Only when there is something to save. A button that is always there
          asserts there is always pending work, which trains people to ignore
          it — and then to miss the once it mattered. Tinted, so it reads as a
          state the page is in rather than as another row of furniture. */}
      {dirty && (
        <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-primary)_5%,var(--color-background))] px-5 py-3">
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

/**
 * The fetched week as the form edits it: id-less rows, in canonical order —
 * and carrying each rule's own buffer, grid and capacity, not just its hours.
 *
 * `setWeeklyPattern` replaces a member's whole week in one call. Dropping the
 * shape fields here would mean every rule the provider did *not* touch this
 * session still gets resubmitted — as `{weekday, startMinute, endMinute}`
 * alone once `save()` sends `draft` back — and the server reads a shape-less
 * row as "use the default", silently erasing whatever that rule's buffer,
 * grid or capacity used to be.
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
 * Field by field rather than by `JSON.stringify`: key order is not part of
 * what makes two weeks equal, and a serialiser that happened to emit a
 * different order would report a clean week as unsaved.
 *
 * Compares the shape fields too, not just hours — editing only a rule's
 * capacity through the drawer, with its days and times untouched, is still a
 * real change, and the save bar above the week has no other signal to raise
 * on.
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
          className="font-semibold text-[var(--color-primary)] underline-offset-2 hover:underline"
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
