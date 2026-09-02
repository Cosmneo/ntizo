import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useRouterState, useSearch } from "@tanstack/react-router";
import { ArrowLeft, PackageX } from "lucide-react";
import type { AddressDTO } from "@ntizo/shared";
import type { ServiceDetailDTO, ServiceDetailOptionDTO } from "@ntizo/shared/read-models";
import { addDays, localDateAt } from "@ntizo/shared/datetime";
import { Button, Skeleton } from "@ntizo/frontend-ui";
import { SiteHeader } from "@/shared/components/site-header";
import { EmptyCard } from "@/shared/components/empty-card";
import { endOfStart, startsByDate, weekOf } from "@/features/directory/availability/domain/day-strip";
import { distinctMemberIds, panelMode } from "@/features/directory/availability/domain/types";
import type { Start } from "@/features/directory/availability/domain/types";
import { useServiceAvailability } from "@/features/directory/availability/viewmodel/use-service-availability";
import { DateStrip } from "@/features/directory/availability/ui/date-strip";
import { MemberPicker } from "@/features/directory/availability/ui/member-picker";
import { TimeGrid } from "@/features/directory/availability/ui/time-grid";
import {
  optionDurationMinutes,
  serviceDetailPanel,
} from "@/features/directory/services/domain/service-card";
import { useServiceDetail } from "@/features/directory/services/viewmodel/use-service-detail";
import { useMyAddresses } from "@/features/account/viewmodel/use-addresses";
import { useCurrentUser } from "@/features/user/viewmodel/use-current-user";
import { useCreateBooking } from "@/features/checkout/viewmodel/use-checkout";
import { compactSlotWording } from "@/features/checkout/domain/slot-wording";
import { saveDraftDetails } from "@/features/checkout/domain/draft-store";
import { CheckoutRail } from "@/features/checkout/ui/checkout-rail";
import { CheckoutSteps } from "@/features/checkout/ui/checkout-steps";

/** What `/book/$serviceId` carries in its URL. */
interface BookSearch {
  memberId?: string;
  startsAt?: string;
  /** Which package the customer chose on the service page, when they chose one. */
  optionId?: string;
  /** Set by the countdown when a draft's hold lapsed on step 2 or 3. */
  expired?: boolean;
}

/**
 * The package this checkout is for.
 *
 * `optionId` first, because it is the customer's actual choice: they read a
 * price on the service page and pressed the button beside it, and anything
 * this page books other than that option charges them a number they were
 * never shown. Before the id travelled, this function was just the fallback,
 * and a service with a 500 default and a 900 selection quietly booked the
 * 500 — the page even printed the right price on the service side and the
 * wrong one here.
 *
 * The fallback stays for the callers that have no option id to give (a
 * provider's service row is handed a `ServiceDTO`, whose `defaultOption`
 * carries no id) and for a link whose option has since been deactivated.
 * Falling back is safe *because this page prints what it is about to book* —
 * the name, the price and the length are in the rail beside the confirm — so
 * a customer whose id did not resolve sees the substitution rather than
 * discovering it on the invoice.
 *
 * **The fallback is the cheapest option, not the one flagged default**, and
 * the difference is the promise the caller already made. The only control
 * that reaches this page without naming an option is `ServiceRow`, and its
 * price column reads "a partir de 500" — from the cheapest. Falling back to a
 * default flag sitting on the expensive package answers that row with a page
 * quoting 900. `options[0]` *is* the cheapest: `serviceById` orders them that
 * way and this deliberately does not sort again, for the reason
 * `ServiceDetailPage` gives about its own list — a second sort is a second
 * place the rule can drift from the server's.
 */
function chosenOption(
  options: readonly ServiceDetailOptionDTO[],
  optionId: string | undefined,
): ServiceDetailOptionDTO | null {
  const named = optionId ? options.find((o) => o.id === optionId) : undefined;
  return named ?? options[0] ?? null;
}

/**
 * The refusals that mean "the grid you are looking at is out of date".
 *
 * All three are answers, not errors: somebody else took the slot, the
 * provider's calendar changed under it, or enough time passed that it is now
 * in the past. Each one calls for the same two things — say which of the
 * three happened, and go and fetch the times that are actually free — where
 * "something went wrong" would leave the customer clicking a dead time until
 * they gave up.
 */
const STALE_GRID_CODES: ReadonlySet<string> = new Set([
  "SLOT_ALREADY_TAKEN",
  "SLOT_NOT_OFFERED",
  "SLOT_IN_PAST",
]);

/** The device's own IANA zone — the only clock available before the first response names the service's own. */
function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** Which address this checkout is for: one the customer has saved, or one they will type on step 2. */
type WhereChoice = { kind: "saved"; addressId: string } | { kind: "other" };

/**
 * Which of the where-cards is filled in, given what the customer has clicked
 * so far.
 *
 * Untouched opens on the address book's default — the one they told us to
 * assume — and on "other" when they have no saved address at all, which is
 * also what an anonymous visitor and a list that failed to load resolve to.
 * There is always exactly one answer, so the confirm is never disabled for a
 * reason nobody can see.
 *
 * **`settled` is why the membership test is safe**, the same argument step 2's
 * `openingAddressId` makes: honouring a chosen id unconditionally while the
 * list is still in flight stops it flickering back to the default on the
 * first render, and once the list *has* answered, an id it does not contain
 * is an id this page cannot draw a checked radio for — the customer deleted
 * that address in another tab. Falling back then leaves the group with
 * something checked rather than nothing.
 */
function openingWhere(
  picked: WhereChoice | null,
  addresses: readonly AddressDTO[],
  settled: boolean,
): WhereChoice {
  if (picked && (picked.kind === "other" || !settled || addresses.some((a) => a.id === picked.addressId))) {
    return picked;
  }
  const fallback = addresses.find((a) => a.isDefault) ?? addresses[0];
  return fallback ? { kind: "saved", addressId: fallback.id } : { kind: "other" };
}

/** One saved address as a single line: enough to tell two of them apart, not the whole record. */
function addressSummary(address: AddressDTO): string {
  return [address.line1, [address.district, address.city].filter(Boolean).join(", ")]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Which moment to open the calendar around: the slot already in the URL, or
 * now.
 *
 * A `startsAt` that does not parse is treated as absent rather than allowed
 * to produce an `Invalid Date` — the URL is a string anybody can type, and
 * the cost of a typo should be an ordinary-looking calendar, not a page of
 * `NaN`.
 */
function openingInstant(startsAt: string | undefined): Date {
  if (startsAt) {
    const chosen = new Date(startsAt);
    if (!Number.isNaN(chosen.getTime())) return chosen;
  }
  return new Date();
}

/**
 * Step 1 of checkout: when.
 *
 * This is what replaced `AvailabilitySheet`, the dialog that used to open
 * over a provider's page. The three components inside it — `DateStrip`,
 * `MemberPicker`, `TimeGrid` — are that sheet's own children, reused as they
 * were. What changed is everything around them: a modal with no
 * booking control at all became a page with one, because when the sheet was
 * written the Booking context did not exist and offering a button that could
 * do nothing would have read as broken software.
 *
 * A page rather than a dialog because the errand is no longer short. Choosing
 * a time is now the first of three steps that end in a request to a real
 * provider, and a purchase behind a dialog cannot be linked to, cannot
 * survive a refresh, and cannot survive the round trip through sign-in that
 * an anonymous visitor has to make.
 *
 * Split in two so the availability query below is not called after an early
 * return: a service that does not resolve needs no calendar, and a hook that
 * runs for one service and not another is the one thing React forbids. The
 * same split `ServiceDetailPage` makes, for the same reason.
 */
export function ChooseWhenPage({ serviceId }: { serviceId: string }) {
  const { t } = useTranslation("directory");
  const service = useServiceDetail(serviceId);

  if (!service) {
    return (
      <>
        <SiteHeader current="services" />
        <main className="page-shell py-12">
          <EmptyCard
            framed
            badge={PackageX}
            title={t("serviceNotFoundTitle")}
            body={t("serviceNotFoundBody")}
            action={
              <Link
                to="/services"
                className="rounded-full bg-[var(--color-primary)] px-5 py-2 text-sm font-semibold text-white hover:opacity-90"
              >
                {t("serviceNotFoundAction")}
              </Link>
            }
          />
        </main>
      </>
    );
  }

  return <ChooseWhen service={service} />;
}

function ChooseWhen({ service }: { service: ServiceDetailDTO }) {
  const { t, i18n } = useTranslation("checkout");
  const { t: td } = useTranslation("directory");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const navigate = useNavigate();

  /**
   * **The chosen slot lives here, in the URL, and not in component state.**
   *
   * Signing in leaves the app entirely, and a choice held in memory does not
   * survive that: the customer would come back to an empty grid having
   * already decided. It is also what makes a slot linkable and a refresh
   * harmless — the two other ways a modal loses a decision somebody has
   * already made.
   *
   * `strict: false` rather than naming this route, so the component can be
   * mounted (and tested) without the router type registry having to agree
   * with it first — the same read `sign-in.tsx` makes of `next`.
   */
  const search = useSearch({ strict: false }) as BookSearch;
  const href = useRouterState({ select: (s) => s.location.href });

  const { create, pending, errorCode, failed, reset } = useCreateBooking();

  // Whichever package the customer was looking at when they left the service
  // page — see `chosenOption` for why a guess is not good enough here.
  const option = chosenOption(service.options, search.optionId);

  // A first guess at which week to open on, and *only* a guess: the slot
  // already in the URL, or the visitor's own device date. It is not
  // necessarily the service's civil date — that needs
  // `availability.forService`'s own `timezone`, which arrives with the first
  // response — so nothing but the initial fetch window is allowed to depend
  // on it. Which day a chosen slot belongs to is decided by `chosenCivilDate`
  // below, in the service's zone.
  const [anchorDate, setAnchorDate] = useState(() =>
    localDateAt(deviceTimeZone(), openingInstant(search.startsAt)),
  );
  const [browsedDate, setBrowsedDate] = useState(anchorDate);
  const [selectedLengthMinutes, setSelectedLengthMinutes] = useState<number | null>(null);
  const [pickedWhere, setPickedWhere] = useState<WhereChoice | null>(null);

  // **This page is public**, and the address book is not. `useCurrentUser` is
  // already in flight for the site header above, so reading it costs nothing
  // and spares an anonymous visitor a guaranteed `UNAUTHENTICATED` round trip
  // on a page that has only asked them to pick a time.
  const { data: viewer } = useCurrentUser();
  const { data: addresses = [], isPending: addressesLoading } = useMyAddresses({
    enabled: Boolean(viewer),
  });
  // A list that failed is not an empty one, but on *this* page both come to
  // the same thing: there is nothing to draw a saved card from, and the
  // customer can still say where on step 2, which retries the list itself.
  // Nothing here is worth blocking a slot for.
  const where = openingWhere(pickedWhere, addresses, Boolean(viewer) && !addressesLoading);

  const week = weekOf(anchorDate);
  const { data, isPending, isError, error, refetch } = useServiceAvailability({
    serviceId: service.id,
    memberId: search.memberId,
    from: week[0]!,
    to: week[6]!,
  });

  /**
   * The civil date the chosen instant actually falls on, **in the service's
   * own timezone** — the only authority on which day a slot belongs to.
   *
   * This used to be the device's zone, and that was a defect rather than an
   * approximation. A service in `Africa/Maputo` offering 23:00 UTC is
   * offering 01:00 the *next* morning; a customer whose device is on UTC had
   * the strip sit on the previous day, so `days.find` matched nothing, the
   * grid drew zero buttons — and the confirm stayed enabled, ready to hold a
   * slot the page was not showing. It is routine for a `remote` service, and
   * reachable in the launch market for an early-morning slot on a device
   * clocked to UTC. Worse, it fails on exactly the two paths the
   * slot-in-the-URL design exists to protect: a shared link and the return
   * from sign-in.
   *
   * Null until availability answers (the zone comes with it) or when no slot
   * is chosen — in which case the customer is browsing and `browsedDate` is
   * the honest answer.
   */
  const chosenCivilDate =
    data && search.startsAt && !Number.isNaN(new Date(search.startsAt).getTime())
      ? localDateAt(data.timezone, new Date(search.startsAt))
      : null;
  const shownDate = chosenCivilDate ?? browsedDate;

  useEffect(() => {
    // Only ever moves the *fetch window*, never what the customer is looking
    // at, which is why this can be an effect without fighting a date click:
    // `shownDate` is derived, so a user's choice cannot be overwritten by
    // this landing a render later. Needed because the device's guess can put
    // a chosen slot in the neighbouring week, and a week nobody fetched has
    // no starts to select from.
    if (chosenCivilDate && !weekOf(anchorDate).includes(chosenCivilDate)) {
      setAnchorDate(chosenCivilDate);
    }
    // `anchorDate`, not `week`: `weekOf` builds a fresh array every render, so
    // depending on it would re-run this on every render for nothing.
  }, [chosenCivilDate, anchorDate]);

  useEffect(() => {
    if (!errorCode) return;
    if (errorCode === "UNAUTHENTICATED") {
      // Holding a slot needs a session, and this page is public — so this is
      // an expected outcome, not a bug. `next` carries the whole href,
      // search parameters included, which is exactly why the choice lives in
      // the URL: signing in and coming back lands on the slot they picked.
      void navigate({ to: "/sign-in", search: { next: href } });
      return;
    }
    if (STALE_GRID_CODES.has(errorCode)) void refetch();
    // `href` and `refetch` deliberately left out: this must fire once, when
    // `errorCode` first becomes a code, reading whatever `href` is at that
    // moment. Listing `href` turns the navigation this effect just performed
    // into its own retrigger — the redirect lands on `/sign-in`, `href`
    // updates, and the effect re-runs with `next: "/sign-in"`. The same trap
    // `MessageProviderButton` documents against its own `pathname`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errorCode, navigate]);

  /** Rewrite the URL's slot. Absent keys are dropped rather than written as `undefined`. */
  function goToSlot(next: { memberId?: string; startsAt?: string }) {
    void navigate({
      to: "/book/$serviceId",
      params: { serviceId: service.id },
      search: {
        ...(next.memberId ? { memberId: next.memberId } : {}),
        ...(next.startsAt ? { startsAt: next.startsAt } : {}),
        // Carried, never re-derived: every one of these rewrites replaces the
        // whole search object, so an `optionId` left out here is an `optionId`
        // dropped the moment the customer picks a time — which is the same
        // silent downgrade to the default package that putting it in the URL
        // exists to prevent, just one click later.
        ...(search.optionId ? { optionId: search.optionId } : {}),
      },
      // Replaced rather than pushed: trying four times on the way to picking
      // one is not four places a customer wants their back button to visit.
      replace: true,
    });
  }

  function goToWeek(nextAnchor: string) {
    setAnchorDate(nextAnchor);
    setBrowsedDate(nextAnchor);
    setSelectedLengthMinutes(null);
    reset();
    goToSlot({ memberId: search.memberId });
  }

  function selectDate(dateIso: string) {
    setBrowsedDate(dateIso);
    setSelectedLengthMinutes(null);
    reset();
    // The chosen time belonged to the day being left, so it goes with it.
    goToSlot({ memberId: search.memberId });
  }

  function selectMember(memberId: string | undefined) {
    setSelectedLengthMinutes(null);
    reset();
    // Same reasoning as changing the day: the time that was chosen was one
    // somebody else was free at, and may not be free for this person.
    goToSlot({ memberId });
  }

  function selectStart(start: Start) {
    setSelectedLengthMinutes(null);
    reset();
    goToSlot({
      // **"Anyone available" has to become somebody here.** A held slot
      // belongs to one member's calendar and `booking.create` has no way to
      // express "whoever", so the absence the picker allows is resolved the
      // moment a time is chosen — off this start's own `memberIds`, which is
      // exactly who is free at this moment. Sorted rather than taken in
      // array order, so the same click twice picks the same person: the read
      // model promises the set, not its order.
      memberId: search.memberId ?? [...start.memberIds].sort()[0],
      startsAt: start.startsAt,
    });
  }

  function confirm() {
    if (!option || !search.startsAt || !search.memberId) return;
    void create({
      serviceOptionId: option.id,
      providerMemberId: search.memberId,
      startsAt: search.startsAt,
      locale,
    }).then(
      // The draft holds the slot; steps 2 and 3 are addressed by its id and
      // by nothing else. The service and the package do not travel with it:
      // `bookingReadModel` carries `serviceId` and `serviceOptionId`, so the
      // far side reads them off the booking it is already loading. Sending a
      // second copy in the URL would be a second source for one fact, and the
      // one a shared link can get wrong.
      ({ bookingId }) => {
        // **The choice moves to step 1; the write does not.** The address is
        // not on `booking.create`'s input — the schema has no such field —
        // and it still travels on `booking.submit`, so this is the same two
        // writes it always was. What is recorded here is the *decision*, in
        // the tab's own store, keyed by the booking that has this instant
        // come into existence. `null` is "outro endereço": a positive answer
        // meaning the customer will type one on step 2, not an absence.
        saveDraftDetails(bookingId, {
          addressId: where.kind === "saved" ? where.addressId : null,
          description: "",
        });
        void navigate({ to: "/booking/$bookingId/details", params: { bookingId } });
      },
      // Swallowed on purpose: `errorCode` already carries the failure
      // reactively and the message below renders from it. Rethrowing here
      // would only add an unhandled rejection saying the same thing.
      () => {},
    );
  }

  const panel = serviceDetailPanel(service);
  const day = data?.days.find((d) => d.date === shownDate);
  // Derived from the URL rather than held beside it, so there is only ever
  // one answer to "which time is chosen" — and so a slot arrived at by link
  // or by coming back from sign-in is already selected on arrival.
  const selectedStart = day?.starts.find((s) => s.startsAt === search.startsAt) ?? null;
  /**
   * **`booking.create` refuses an hourly option, and nothing stops a provider
   * publishing one.** `canPublish` checks the member count and the option
   * count and says nothing about pricing mode, so an hourly service is a real,
   * published, listed thing whose service page renders "Ver disponibilidade"
   * and lands here.
   *
   * The command's refusal is `ServiceNotBookableError("hourly")`, which is
   * permanent: it is a fact about the option, and pressing the button again
   * cannot change it. `SERVICE_NOT_BOOKABLE_HOURLY` has no key under
   * `createError`, so the customer read the generic "Tente novamente" — a
   * permanent refusal wearing a transient one's words, which makes the honest
   * reaction to it *keep pressing*.
   *
   * So the refusal is moved forward to where it can be explained. Adding the
   * missing error string would have been the smaller change and the worse
   * one: the customer would still choose a time, still choose a length off
   * the ladder (which `booking.create` has no field to carry — it is a
   * control that changes nothing), and still learn at the end.
   *
   * The calendar stays. This page is reached from a button that says "see
   * availability", and seeing it is exactly what an hourly service can still
   * offer; what it cannot offer is the confirm, and that now says so.
   * Follow-up #94 is where hourly booking itself lives.
   */
  const isHourly = option?.pricingMode === "hourly";
  /**
   * `selectedStart`, not `search.startsAt`.
   *
   * The URL is the customer's *claim* about which slot they want; the grid is
   * the platform's answer about which slots exist. Confirming on the claim
   * alone let the page hold a slot it was not displaying — a whole class of
   * failure, not one bug:
   *
   * - a slot whose civil date the page had wrong drew an empty grid under an
   *   enabled button (the cross-zone defect `chosenCivilDate` fixes);
   * - after `SLOT_ALREADY_TAKEN` the grid refetches and the refused time
   *   disappears from it, but `search.startsAt` is untouched — so the confirm
   *   stayed live on the very slot that had just been refused;
   * - a shared or bookmarked link naming a slot the provider has since
   *   withdrawn offered a button that could only fail.
   *
   * Requiring the start to be one the grid is actually showing closes all
   * three at once, and keeps a rule worth stating plainly: this page never
   * offers to book something it is not showing.
   */
  const canConfirm =
    Boolean(option && selectedStart && search.memberId) && !isHourly && !pending;

  const minutes = option ? optionDurationMinutes(option) : null;
  /**
   * How long the appointment on a time card runs.
   *
   * Null on an hourly package rather than `minMinutes`: the length is the
   * customer's to choose from the ladder underneath, and printing "até 10:00"
   * on every card before they have chosen would state a finishing time the
   * booking has not got.
   */
  const cardDurationMinutes = isHourly ? null : minutes;

  let body: React.ReactNode;
  if (panel.kind === "quote") {
    // A quote service has no fixed price and no fixed length, so there is no
    // slot to hold and nothing on this page to confirm. `panelMode` below
    // reads the same fact off the availability response; this reads it off
    // the service, which is what lets the page say so before the calendar
    // query has even answered.
    body = <p className="type-body text-[var(--color-muted-foreground)]">{td("availabilityQuoteNotice")}</p>;
  } else if (panel.kind === "unavailable") {
    body = (
      <p className="type-body text-[var(--color-muted-foreground)]">
        {td("packagesUnavailableNotice")}
      </p>
    );
  } else if (isPending) {
    body = (
      <div className="grid gap-3">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  } else if (isError || !data) {
    const code = (error as { code?: string } | undefined)?.code;
    body = (
      <p className="text-sm text-[var(--color-destructive)]">
        {td(`availabilityForServiceError.${code}`, {
          defaultValue: td("availabilityForServiceErrorGeneric"),
        })}
      </p>
    );
  } else if (panelMode(data) === "quote") {
    body = <p className="type-body text-[var(--color-muted-foreground)]">{td("availabilityQuoteNotice")}</p>;
  } else {
    const todayIso = localDateAt(data.timezone, new Date());
    // The roster is the response's top-level `memberIds` — who performs this
    // service, full stop — never the per-start ones, which are scoped to this
    // window and to whoever the query is currently filtered to. See
    // `distinctMemberIds`'s own doc comment for the bug that distinction
    // exists to prevent: a picker that loses its "anyone" option, and with it
    // the visitor's only way back out of a filter.
    const memberIds = distinctMemberIds(data.memberIds);

    body = (
      <div className="grid gap-6">
        <DateStrip
          week={week}
          selectedDate={shownDate}
          todayIso={todayIso}
          locale={locale}
          // How many bookable times each day carries, so the strip can say so
          // on the card rather than making the customer open seven days to
          // find out. Read off the same response the grid draws from, which
          // is what keeps the number and the times under it in agreement.
          startsByDate={startsByDate(data.days)}
          onSelectDate={selectDate}
          onPreviousWeek={() => goToWeek(addDays(anchorDate, -7))}
          onNextWeek={() => goToWeek(addDays(anchorDate, 7))}
        />
        {/*
          `performers` comes off `serviceById`, which this page already reads,
          so a member the service names is labelled with their real first
          name. The numbered fallback underneath — "Professional 1",
          "Professional 2" — is not a loading state and not a gap waiting to
          be filled: `availability.forService` answers "who is free" by id
          alone and never carries a name, so an id this list does not cover
          (or covers with the blank `firstName` its schema defaults to) has a
          real, permanent answer rather than a temporary one. See
          `MemberPicker`'s own doc comment.
        */}
        <MemberPicker
          memberIds={memberIds}
          selectedMemberId={search.memberId}
          onChange={selectMember}
          performers={service.performers}
        />
        <TimeGrid
          starts={day?.starts ?? []}
          pricingMode={data.pricingMode}
          durationMinutes={cardDurationMinutes}
          minMinutes={option?.minMinutes ?? null}
          stepMinutes={option?.stepMinutes ?? null}
          locale={locale}
          timezone={data.timezone}
          selectedStart={selectedStart}
          selectedLengthMinutes={selectedLengthMinutes}
          onSelectStart={selectStart}
          onSelectLength={setSelectedLengthMinutes}
        />
        <WhereSection
          addresses={addresses}
          loading={Boolean(viewer) && addressesLoading}
          chosen={where}
          onChoose={setPickedWhere}
        />
      </div>
    );
  }

  /**
   * The appointment as the rail prints it, or null while there is nothing to
   * print.
   *
   * **From `selectedStart`, never from `search.startsAt`** — the same rule
   * `canConfirm` follows, and for the same reason: the URL is the customer's
   * claim, the grid is the platform's answer, and a rail that named a time
   * the grid is not showing would be a second place this page can offer
   * something that does not exist.
   *
   * On an hourly package the end follows whichever length is currently
   * selected, because that is the only thing that makes one; with none
   * chosen it falls back to the minimum, which is what the ladder opens on.
   */
  const railMinutes = isHourly ? (selectedLengthMinutes ?? minutes) : minutes;
  const railSlot =
    data && selectedStart && railMinutes !== null
      ? compactSlotWording(
          selectedStart.startsAt,
          endOfStart(selectedStart.startsAt, railMinutes),
          locale,
          data.timezone,
        )
      : null;

  return (
    <>
      <SiteHeader current="services" />

      <main className="page-shell py-8">
        <Link
          to="/services/$id"
          params={{ id: service.id }}
          className="type-caption inline-flex items-center gap-1.5 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          {t("backToService")}
        </Link>

        <div className="mt-4 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
          <div className="min-w-0">
            <CheckoutSteps current="when" />
            <h1 className="type-h1 mt-4">{t("chooseWhenTitle")}</h1>
            <p className="type-body mt-2 text-[var(--color-muted-foreground)]">
              {t("chooseWhenIntro")}
            </p>

            {search.expired && (
              <p
                role="alert"
                className="mt-4 rounded-[var(--radius-card-sm)] border border-[var(--color-border)] p-3 text-sm"
              >
                {t("holdExpired")}
              </p>
            )}

            <div className="mt-8">{body}</div>
          </div>

          {/* 100px, not 0: the site header is 84px and sticky, so a rail
              pinned to the top of the viewport would slide under it. */}
          <aside className="grid gap-4 lg:sticky lg:top-[100px]">
            {/* No `onChangeSlot`: this page *is* where the slot is changed,
                and an "Alterar" pointing at the grid two inches to its left
                would be a control that does nothing. */}
            <CheckoutRail
              imageUrl={service.imageUrls[0] ?? null}
              serviceName={service.name}
              providerName={service.providerName}
              optionName={option?.name ?? null}
              slot={railSlot}
              locationType={service.locationType}
              // The *package's* own figure, not whatever length is currently
              // selected: on an hourly option this reads "Mínimo de 60 min",
              // which stays true however long the customer picks, while the
              // finishing time in the panel above follows the pick.
              durationMinutes={minutes}
              // Null rather than zero when there is no package: a quote
              // service reaches this page and has no priced option at all,
              // and `Intl` throws on the blank currency code a `?? 0` would
              // have to be paired with.
              priceMinor={option?.amountMinor ?? null}
              currency={option?.currency ?? ""}
              hourly={isHourly}
            >
              {failed && (
                <p role="alert" className="text-sm text-[var(--color-destructive)]">
                  {errorCode
                    ? t(`createError.${errorCode}`, { defaultValue: t("createErrorGeneric") })
                    : t("createErrorGeneric")}
                </p>
              )}

              {/* Directly above the button, because it is the answer to why
                  the button is dead — and referenced by it, so a screen
                  reader that reaches a disabled control is given the reason
                  rather than silence. */}
              {isHourly && (
                <p
                  id="checkout-hourly-notice"
                  className="type-caption text-[var(--color-muted-foreground)]"
                >
                  {t("hourlyNotBookable")}
                </p>
              )}

              <Button
                type="button"
                className="w-full"
                disabled={!canConfirm}
                {...(isHourly ? { "aria-describedby": "checkout-hourly-notice" } : {})}
                onClick={confirm}
              >
                {t("continueAction")}
              </Button>
            </CheckoutRail>
          </aside>
        </div>
      </main>
    </>
  );
}

/**
 * "Onde é o serviço", on step 1 rather than step 2.
 *
 * **Only the choice moved; the write did not.** Nothing here reaches the
 * server: `booking.create` has no address field to send one to, and the
 * address still travels on `booking.submit`. What this collects is recorded
 * in the tab's own store the moment the draft exists — see `confirm` — so
 * step 2 opens on the answer already given instead of asking it twice.
 *
 * "Outro endereço" is always offered and is the only card when there is
 * nothing saved to choose between, which is the same reasoning step 2's
 * address book uses for showing its form to a customer with an empty list:
 * the next step is the empty state, not a dead list. It is also what an
 * anonymous visitor sees, because their address book is not readable until
 * they have signed in — and this page is public.
 */
function WhereSection({
  addresses,
  loading,
  chosen,
  onChoose,
}: {
  addresses: readonly AddressDTO[];
  loading: boolean;
  chosen: WhereChoice;
  onChoose: (choice: WhereChoice) => void;
}) {
  const { t } = useTranslation("checkout");

  return (
    <fieldset className="grid gap-3 border-0 p-0">
      <legend className="type-h3 font-semibold">{t("whereHeading")}</legend>

      {loading ? (
        <Skeleton className="h-20 w-full" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {addresses.map((address) => (
            <label
              key={address.id}
              className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-card)] border border-[var(--color-border)] p-4"
            >
              <input
                type="radio"
                name="checkout-where"
                value={address.id}
                checked={chosen.kind === "saved" && chosen.addressId === address.id}
                onChange={() => onChoose({ kind: "saved", addressId: address.id })}
                className="mt-1 h-4 w-4 accent-[var(--color-primary)]"
              />
              <span className="min-w-0">
                <span className="type-body-medium block font-semibold">{address.label}</span>
                <span className="type-caption block text-[var(--color-muted-foreground)]">
                  {addressSummary(address)}
                </span>
              </span>
            </label>
          ))}

          <label className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-card)] border border-[var(--color-border)] p-4">
            <input
              type="radio"
              name="checkout-where"
              value="other"
              checked={chosen.kind === "other"}
              onChange={() => onChoose({ kind: "other" })}
              className="mt-1 h-4 w-4 accent-[var(--color-primary)]"
            />
            <span className="min-w-0">
              <span className="type-body-medium block font-semibold">{t("whereOther")}</span>
              <span className="type-caption block text-[var(--color-muted-foreground)]">
                {t("whereOtherHint")}
              </span>
            </span>
          </label>
        </div>
      )}
    </fieldset>
  );
}
