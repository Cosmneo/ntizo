import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, CalendarDays, FileText, MapPin, Smartphone } from "lucide-react";
import type { AddressDTO } from "@ntizo/shared";
import { toMpesaMsisdn } from "@ntizo/shared";
import { Button, Skeleton } from "@ntizo/frontend-ui";
import { CheckoutHeader } from "@/features/checkout/ui/checkout-header";
import { useMyAddresses } from "@/features/account/viewmodel/use-addresses";
import { useCurrentUser } from "@/features/user/viewmodel/use-current-user";
import type {
  CheckoutBooking,
  SubmitBookingAddress,
} from "@/features/checkout/viewmodel/use-checkout";
import { useMyBooking, useSendBookingRequest } from "@/features/checkout/viewmodel/use-checkout";
import { CheckoutCountdown } from "@/features/checkout/ui/checkout-countdown";
import { CheckoutRail } from "@/features/checkout/ui/checkout-rail";
import { readDraftDetails } from "@/features/checkout/domain/draft-store";
import { checkoutOutcome } from "@/features/checkout/domain/booking-outcome";
import { compactSlotWording, slotWording } from "@/features/checkout/domain/slot-wording";
import {
  BookingOutcomePanel,
  SentPanel,
} from "@/features/checkout/ui/booking-outcome-panel";


/** One card per section, the frame step 2 draws around each of its questions. */
const CARD = "rounded-[var(--radius-card)] border border-[var(--color-border)] p-4 sm:p-5";

/** The tinted disc an icon sits in — step 2's address pin, here on every row of the record. */
const ICON_BADGE =
  "grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--color-muted)] text-[var(--color-primary)]";

/** The order money and commitment happen in, as three keys so each stays greppable. */
const HOW_IT_WORKS = ["howItWorks1", "howItWorks2", "howItWorks3"] as const;

/**
 * A stored coordinate as a number, or `null`.
 *
 * `AddressDTO` carries latitude and longitude as strings, because Postgres
 * `numeric` crosses the wire as one and rounding it to a float at the read
 * model would be losing precision the column was chosen to keep. The mutation
 * takes numbers, so the conversion happens here — and a value that does not
 * parse becomes `null` rather than `NaN`, which would serialise to JSON as
 * `null` anyway but only after passing through arithmetic as a number.
 */
function coordinate(raw: string | null): number | null {
  if (raw === null) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/**
 * One saved address in the shape `booking.submit` takes.
 *
 * `line1` and `line2` are joined rather than one being dropped: a flat or an
 * apartment number lives in the second line, and a provider sent to the
 * building without it is a provider standing outside the right door.
 *
 * The booking keeps this as a snapshot, so the customer correcting their
 * street next March does not move where the provider went last week — which
 * is why the components travel by value and no address id is sent.
 */
function toSubmitAddress(address: AddressDTO): SubmitBookingAddress {
  return {
    label: address.label,
    line: [address.line1, address.line2].filter(Boolean).join(", "),
    city: address.city,
    district: address.district,
    directions: address.directions,
    lat: coordinate(address.latitude),
    lng: coordinate(address.longitude),
  };
}

/**
 * Step 3 of checkout: read it back, say where the payment prompt goes, send
 * it.
 *
 * **This is not a payment page, and the mockup it comes from was drawn when
 * it was.** Under confirm-first — decided with the payment reversal — the
 * customer sends a request, the provider has a window to answer, and money
 * moves only after they accept. The mockup's own promise survived the change
 * intact ("Nada é cobrado agora"), which is why the rest of it did too.
 *
 * **One payment method, not a chooser with disabled options.** M-Pesa only
 * this phase; card and cash are out of scope with reasons of their own. A
 * radio group with one live option and two greyed ones offers a decision
 * nobody can make and invites the customer to want the thing they cannot
 * have.
 *
 * **The rail is the shared one, not a card of its own.** This page used to
 * carry a fourth copy — provider name, service name, price, and none of the
 * trust line — so the screen a customer actually commits on looked unlike the
 * two that led them to it, and the score and badge its own query fetches went
 * unprinted. Its send button, its refusal message and "Nada é cobrado agora"
 * are the rail's `children`; the countdown is its `countdown`.
 *
 * **The phone number is collected on step 2 and only read back here.** The
 * two mutations are unchanged and still both happen on this page — setting a
 * phone number is the User context's job, so `user.updateMyProfile` runs
 * before `booking.submit` and the submit refuses a customer with none on
 * file. What moved is the field, not the rule: the number arrives in the
 * tab's own store beside the address, and a store that carries one
 * `toMpesaMsisdn` refuses sends the customer back to the step that asks
 * rather than into a refusal they cannot act on from here.
 *
 * Split in two so the address, profile and mutation hooks below are not run
 * for a booking this page is about to navigate away from — the same split
 * steps 1 and 2 make, and for the reason React forbids a hook that runs for
 * one render and not the next.
 */
export function ConfirmPage({ bookingId }: { bookingId: string }) {
  const { t } = useTranslation("checkout");
  const { booking, loading, failed } = useMyBooking(bookingId);
  const navigate = useNavigate();

  // `loading` is checked first and cannot be folded in: on the very first
  // render there is no data yet, and a bare `booking === null` would read
  // that as "your draft is gone" and bounce every customer off the page
  // before their booking had finished loading.
  const settled = !loading && !failed;
  // **One reading of the booking, shared with step 2.** `checkoutOutcome`
  // owns the whole mapping — including the two halves of `EXPIRED`, which
  // need opposite answers and which the two pages used to disagree about.
  const outcome = booking ? checkoutOutcome(booking) : null;
  // **Two departures, because they know two different amounts.** A booking
  // this customer can read names the service and the package to go back to;
  // a `null` names nothing at all.
  const released = settled && outcome === "released";
  const unreadable = settled && booking === null;

  useEffect(() => {
    // The design's failure table: "the slot was released; back to step 1 with
    // the service kept" — and the service is the booking's own, read off the
    // row rather than carried alongside it. `replace`, so the back button
    // does not walk the customer into a page whose booking is gone.
    if (released && booking) {
      void navigate({
        to: "/book/$serviceId",
        params: { serviceId: booking.serviceId },
        search: { expired: true, optionId: booking.serviceOptionId },
        replace: true,
      });
      return;
    }
    // **`null` cannot mean "back to step 1 with the service kept", because
    // there is no service to keep.** It is how the server answers for a
    // booking that is not this customer's, or an id that never named one, and
    // reconstructing step 1 from anything else on the page would be guessing
    // at a booking we are not allowed to read.
    if (unreadable) void navigate({ to: "/services", search: {}, replace: true });
  }, [released, unreadable, booking, navigate]);

  // `outcome === "released"` rather than the `released` alias: the alias is a
  // conjunction, so a reader — and the compiler — cannot conclude from its
  // being false that the outcome is not `"released"`, and the panel below
  // must be unreachable for the one outcome that has no panel.
  if (loading || unreadable || outcome === "released") {
    return (
      <ConfirmShell>
        <ConfirmSkeleton />
      </ConfirmShell>
    );
  }

  if (failed || !booking || outcome === null) {
    return (
      <ConfirmShell>
        <p role="alert" className="text-sm text-[var(--color-destructive)]">
          {t("loadError")}
        </p>
      </ConfirmShell>
    );
  }

  if (outcome !== "draft") {
    // Everything past `DRAFT`, each with an answer that is true of it — see
    // `BookingOutcomePanel`. **The unanswered request is the expected end
    // state of very nearly every request this phase**, not a rarity: `accept`
    // and `decline` belong to the provider inbox's own spec and are not
    // mounted, so almost every request sent runs its window out.
    return (
      <ConfirmShell>
        <BookingOutcomePanel booking={booking} outcome={outcome} />
      </ConfirmShell>
    );
  }

  return <Confirm booking={booking} />;
}

/** The header and the page frame — everything true before the booking is. */
function ConfirmShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <CheckoutHeader current="confirm" />
      <main className="page-shell py-8">{children}</main>
    </>
  );
}

function ConfirmSkeleton() {
  return (
    <div className="grid gap-3">
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

function Confirm({ booking }: { booking: CheckoutBooking }) {
  const { t, i18n } = useTranslation("checkout");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const navigate = useNavigate();

  const { data: addresses = [], isPending: addressesLoading } = useMyAddresses();
  const { data: user, isPending: userLoading } = useCurrentUser();
  const request = useSendBookingRequest();

  // Read once, on mount, exactly as step 2 writes it. The address, the note
  // and the phone number reached this page through the tab's own store and
  // through nothing else — this design writes to the server twice, at the two
  // ends of checkout, and never in between.
  const [details] = useState(() => readDraftDetails(booking.id));
  /**
   * The deadline the send came back with — and, by being set at all, the fact
   * that this page's errand is done.
   *
   * Held here rather than read back off the booking: the mutation already
   * answered with `respondBy`, and waiting for a refetch to say the same
   * thing would leave the customer looking at a live send button for a
   * request that has already gone. The query is invalidated as well (see
   * `useSendBookingRequest`), so a later visit tells the same story from the
   * server rather than from this state.
   */
  const [respondBy, setRespondBy] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  // Step 2's answer first, the profile behind it. The order is the same one
  // the address follows: what the customer said in this checkout wins over
  // what the platform happened to hold, because the number they typed on the
  // step before is the one they expect the prompt on.
  const phone = details?.phoneNumber ?? user?.phoneNumber ?? "";
  // **The same rule the charge uses, applied again on this side of the
  // store.** Step 2 refuses to continue on a number `toMpesaMsisdn` rejects,
  // but `sessionStorage` is a string anybody with a console open can rewrite
  // and a bookmarked confirm URL never went through step 2 at all.
  const msisdn = toMpesaMsisdn(phone);

  const address = addresses.find((a) => a.id === details?.addressId) ?? null;
  // Not merely "the store was empty": an address chosen on step 2 and deleted
  // in another tab lands here too. Either way there is nothing to send and no
  // honest way to guess, so the customer goes back to the step that asks.
  const addressMissing = !addressesLoading && address === null;
  // And the same for the number, for the same reason and to the same place.
  // `booking.submit` refuses a customer with none on file, so sending anyway
  // buys a round trip whose only outcome is a refusal — on a page that no
  // longer has the field to fix it in.
  const phoneMissing = !userLoading && msisdn === null;

  useEffect(() => {
    if (!addressMissing && !phoneMissing) return;
    void navigate({
      to: "/booking/$bookingId/details",
      params: { bookingId: booking.id },
      replace: true,
    });
  }, [addressMissing, phoneMissing, booking.id, navigate]);

  // **In the service's zone, never the device's.** See `slotWording`: the
  // instant is the same everywhere, the hour it is spoken of in is not, and a
  // page that prints the browser's answer tells the customer a different
  // appointment to the one the provider is expecting them for.
  const when = slotWording(booking.startsAt, booking.endsAt, locale, booking.timezone);
  // The rail's own shorter wording of the same instants, from the same zone
  // argument. Two clocks on one page make whichever the customer checks
  // against the other look wrong, so the compact form is a second *format*
  // and never a second source.
  const railSlot = compactSlotWording(
    booking.startsAt,
    booking.endsAt,
    locale,
    booking.timezone,
  );

  /** Back to step 1, on the package this booking is for — the rail's "Alterar". */
  function changeSlot() {
    void navigate({
      to: "/book/$serviceId",
      params: { serviceId: booking.serviceId },
      search: { optionId: booking.serviceOptionId },
    });
  }

  function send() {
    // Both already decided above, and both send the customer back to step 2
    // when they are missing rather than being reported here — there is
    // nothing on this page to correct either one in.
    if (!msisdn || !address) return;

    // Stored in E.164, the form `profile.phone_number` already holds and the
    // one `toMpesaMsisdn` reads back — see its own doc comment.
    void request
      .send({
        bookingId: booking.id,
        phoneNumber: `+${msisdn}`,
        address: toSubmitAddress(address),
        // Blank is nothing written, not an empty note: the mutation trims and
        // `Booking.submit` stores a null for it either way.
        description: details?.description.trim() || null,
      })
      .then(
        // **Stays on this page.** `/bookings` was a placeholder for as long
        // as this screen existed — see `booking-outcome-panel.tsx` — so
        // navigating there used to answer a successful commitment by denying
        // it happened. It reads real rows now, and `SentPanel`'s own action
        // offers the booking's page as a choice rather than a redirect: this
        // screen is still the only one holding `respondBy`, the one fact the
        // customer actually came here for, and handing it to a page that
        // never asked the instant the mutation resolves would be the same
        // mistake in the opposite direction.
        ({ respondBy: deadline }) => {
          setRespondBy(deadline);
          setSent(true);
        },
        // Swallowed on purpose — `errorCode` already carries the failure
        // reactively and the message below renders from it. Rethrowing would
        // add an unhandled rejection saying the same thing.
        () => {},
      );
  }

  // The errand is finished, and this page is where it finishes. The cache
  // invalidation fired by the send will bring the booking back as
  // `AWAITING_PROVIDER` and reach the same panel through `ConfirmPage`'s own
  // branch — this is what holds the screen steady in the meantime, and what
  // makes the deadline the one the mutation actually answered with rather
  // than one a refetch has yet to confirm.
  if (sent) {
    return (
      <ConfirmShell>
        <SentPanel booking={booking} deadline={respondBy} />
      </ConfirmShell>
    );
  }

  return (
    <>
      <CheckoutHeader current="confirm" />

      <main className="page-shell py-8">
        <Link
          to="/booking/$bookingId/details"
          params={{ bookingId: booking.id }}
          className="type-caption inline-flex items-center gap-1.5 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          {t("backToDetails")}
        </Link>

        {/* One form around both columns, so the send button in the rail is
            the form's own submit rather than a `form` attribute pointing
            across the layout at it. Kept now that the phone field has moved
            to step 2: this page's one action is still a submission, and
            `type="submit"` is what a keyboard reaches it as. */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <div className="mt-4 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
            <div className="min-w-0">
              <h1 className="type-h1">{t("confirmTitle")}</h1>
              <p className="type-body mt-2 text-[var(--color-muted-foreground)]">
                {t("confirmIntro")}
              </p>

              {/* The record of what is being sent, then how it is paid,
                  then what happens next — three framed blocks in the shape
                  step 2 already gave its three questions, so the page the
                  customer commits on looks like the one that led there.

                  The record is read-only on purpose. The rail's "Alterar" is
                  the one control that changes the time, and the back link is
                  the way to everything step 2 owns; a change button on every
                  row here would be a second answer to each of those
                  questions, and the suite pins the rail's as the only one. */}
              <div className="mt-8 grid gap-4">
                <dl className={`${CARD} grid gap-5`}>
                  <div>
                    <dt className="type-caption flex items-center gap-2 text-[var(--color-muted-foreground)]">
                      <CalendarDays className="h-4 w-4 text-[var(--color-primary)]" aria-hidden="true" />
                      {t("summaryWhen")}
                    </dt>
                    <dd className="type-body-medium mt-1 pl-6 font-semibold">{when.date}</dd>
                    <dd className="type-body pl-6 tabular-nums">
                      {t("slotRange", { start: when.start, end: when.end })}
                    </dd>
                  </div>

                  {address && (
                    <div>
                      <dt className="type-caption flex items-center gap-2 text-[var(--color-muted-foreground)]">
                        <MapPin className="h-4 w-4 text-[var(--color-primary)]" aria-hidden="true" />
                        {t("summaryWhere")}
                      </dt>
                      <dd className="type-body-medium mt-1 pl-6 font-semibold">{address.label}</dd>
                      <dd className="type-body pl-6">
                        {[address.line1, address.line2, address.district, address.city]
                          .filter(Boolean)
                          .join(", ")}
                      </dd>
                      {address.directions && (
                        <dd className="type-caption pl-6 text-[var(--color-muted-foreground)]">
                          {address.directions}
                        </dd>
                      )}
                    </div>
                  )}

                  {details?.description.trim() && (
                    <div>
                      <dt className="type-caption flex items-center gap-2 text-[var(--color-muted-foreground)]">
                        <FileText className="h-4 w-4 text-[var(--color-primary)]" aria-hidden="true" />
                        {t("summaryNote")}
                      </dt>
                      <dd className="type-body mt-1 pl-6 whitespace-pre-line">
                        {details.description.trim()}
                      </dd>
                    </div>
                  )}
                </dl>

                {/* One method, stated. Not a radio group with one live option
                    and two greyed ones: a chooser offering a decision nobody
                    can make invites the customer to want what is not there. */}
                <section className={CARD}>
                  <h2 className="type-h3 font-semibold">{t("paymentLegend")}</h2>
                  <div className="mt-4 flex items-start gap-3">
                    <span aria-hidden="true" className={ICON_BADGE}>
                      <Smartphone className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="type-body-medium font-semibold">{t("paymentMpesa")}</p>
                      {/* **The number, read back rather than asked for again.**
                          This page is the last screen before a commitment, and
                          the handset the prompt lands on is one of the two
                          facts on it a customer can still get wrong. Printed
                          from the store, so a wrong one is visible here and
                          correctable one press back on the step that owns the
                          field. */}
                      <p className="type-body tabular-nums">{phone}</p>
                      <p className="type-caption text-[var(--color-muted-foreground)]">
                        {t("paymentMpesaHint")}
                      </p>
                    </div>
                  </div>
                </section>

                {/* Tinted rather than framed: this block is not the customer's
                    own data, it is the platform explaining itself, and the
                    ground says so before a word is read. */}
                <section className="rounded-[var(--radius-card)] bg-[var(--color-muted)] p-4 sm:p-5">
                  <h2 className="type-h3 font-semibold">{t("howItWorksTitle")}</h2>
                  {/* The order money and commitment actually happen in, which
                      is the whole of what the reversal changed. Written without
                      a number of hours in it: the window is
                      `provider_response_minutes`, a live setting an
                      administrator can change, and a figure printed here would
                      be a second source of truth that goes stale silently.
                      Still an `ol`, so it is announced as three ordered steps;
                      the drawn discs replace the browser's own "1." for the
                      eye only. */}
                  <ol className="mt-3 grid list-none gap-3 p-0">
                    {HOW_IT_WORKS.map((key, index) => (
                      <li key={key} className="flex items-start gap-3">
                        <span
                          aria-hidden="true"
                          className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--color-background)] text-xs font-bold text-[var(--color-primary)]"
                        >
                          {index + 1}
                        </span>
                        <span className="type-body text-[var(--color-muted-foreground)]">
                          {t(key)}
                        </span>
                      </li>
                    ))}
                  </ol>
                </section>
              </div>
            </div>

            {/* 80px, not 0: the checkout header is 64px and sticky, so a rail
                pinned to the top of the viewport would slide under it. */}
            <aside className="grid gap-4 lg:sticky lg:top-[80px]">
              {/* **The same rail as steps 1 and 2**, not a fourth card that
                  prints the same booking. This page carried its own until now
                  — provider name, service name, price, and none of the trust
                  line — so the page the customer actually commits on was the
                  one page of three that looked unlike the two that led there,
                  and the score and badge the query already fetches for it were
                  never printed. See follow-up #118, which this closes. */}
              <CheckoutRail
                // `bookingReadModel` carries no picture, and the rail draws
                // its own placeholder rather than being handed a guess.
                imageUrl={null}
                serviceName={booking.serviceName}
                providerName={booking.providerName}
                providerRatingAverage={booking.providerRatingAverage}
                providerVerified={booking.providerVerified}
                optionName={booking.optionName}
                slot={railSlot}
                locationType={booking.locationType}
                durationMinutes={booking.durationMinutes}
                priceMinor={booking.priceMinor}
                currency={booking.currency}
                // Back to step 1, on this booking's own package. The summary
                // on the left is the record of what is being sent and carries
                // no control of its own, so this is the page's single way to
                // change the time — never two "Alterar" buttons for one
                // appointment, which is what follow-up #117 is about.
                onChangeSlot={changeSlot}
                countdown={
                  // `expiresAt` is nullable because the column is. The service
                  // and the option are not: they come off the booking, so the
                  // countdown always has somewhere to send the customer when
                  // the hold lapses.
                  //
                  // `sending` is what stops the last seconds of the hold from
                  // navigating out from under a request that is landing — see
                  // the prop's own doc comment. This is the only page that can
                  // have a write in flight, which is why step 2 passes
                  // nothing.
                  booking.expiresAt ? (
                    <CheckoutCountdown
                      expiresAt={booking.expiresAt}
                      serviceId={booking.serviceId}
                      optionId={booking.serviceOptionId}
                      sending={request.pending}
                    />
                  ) : undefined
                }
              >
                {/* One block rather than three loose children: the rail lays
                    its own slots out on a `gap-5` grid, and a refusal, a
                    button, and the sentence explaining what the button does
                    are one thought rather than three sections of a card. */}
                <div className="grid gap-3">
                  {request.failed && (
                    <p role="alert" className="text-sm text-[var(--color-destructive)]">
                      {request.errorCode
                        ? t(`submitError.${request.errorCode}`, {
                            defaultValue: t("submitErrorGeneric"),
                          })
                        : t("submitErrorGeneric")}
                    </p>
                  )}

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={request.pending || !address || !msisdn}
                  >
                    {t("sendAction")}
                  </Button>

                  {/* The mockup's own promise, and the one sentence on this
                      page that would have been a lie under the old ordering.
                      Directly under the button rather than at the foot of the
                      card: it is the answer to what pressing it does. */}
                  <p className="type-caption text-center text-[var(--color-muted-foreground)]">
                    {t("nothingChargedNow")}
                  </p>
                </div>
              </CheckoutRail>
            </aside>
          </div>
        </form>
      </main>
    </>
  );
}
