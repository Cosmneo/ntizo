import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Smartphone } from "lucide-react";
import type { AddressDTO } from "@ntizo/shared";
import { toMpesaMsisdn } from "@ntizo/shared";
import { Button, Input, Label, Skeleton } from "@ntizo/frontend-ui";
import { SiteHeader } from "@/shared/components/site-header";
import { useMyAddresses } from "@/features/account/viewmodel/use-addresses";
import { useCurrentUser } from "@/features/user/viewmodel/use-current-user";
import { formatAmount } from "@/features/directory/services/domain/service-card";
import type {
  CheckoutBooking,
  SubmitBookingAddress,
} from "@/features/checkout/viewmodel/use-checkout";
import { useMyBooking, useSendBookingRequest } from "@/features/checkout/viewmodel/use-checkout";
import { CheckoutCountdown } from "@/features/checkout/ui/checkout-countdown";
import { CheckoutSteps } from "@/features/checkout/ui/checkout-steps";
import { readDraftDetails } from "@/features/checkout/domain/draft-store";
import { checkoutOutcome } from "@/features/checkout/domain/booking-outcome";
import { slotWording } from "@/features/checkout/domain/slot-wording";
import {
  BookingOutcomePanel,
  SentPanel,
} from "@/features/checkout/ui/booking-outcome-panel";

/** Why the phone field is refusing, or `null` when it is not. */
type PhoneRefusal = "required" | "notVodacom";

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

/** The header, the step marker and the page frame — everything true before the booking is. */
function ConfirmShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader current="services" />
      <main className="page-shell py-8">
        <CheckoutSteps current="confirm" />
        <div className="mt-8">{children}</div>
      </main>
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
  const { data: user } = useCurrentUser();
  const request = useSendBookingRequest();

  // Read once, on mount, exactly as step 2 writes it. The address and the
  // note reached this page through the tab's own store and through nothing
  // else — this design writes to the server twice, at the two ends of
  // checkout, and never in between.
  const [details] = useState(() => readDraftDetails(booking.id));
  const [typedPhone, setTypedPhone] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<PhoneRefusal | null>(null);
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

  // Derived rather than seeded by an effect: the profile arrives a render or
  // two after this component mounts, and an effect that copied it into state
  // would either overwrite what the customer had already started typing or
  // need a flag to remember that it had run. `null` means untouched, which is
  // the only thing a `""` could not distinguish from "cleared on purpose".
  const phone = typedPhone ?? user?.phoneNumber ?? "";

  const address = addresses.find((a) => a.id === details?.addressId) ?? null;
  // Not merely "the store was empty": an address chosen on step 2 and deleted
  // in another tab lands here too. Either way there is nothing to send and no
  // honest way to guess, so the customer goes back to the step that asks.
  const addressMissing = !addressesLoading && address === null;

  useEffect(() => {
    if (!addressMissing) return;
    void navigate({
      to: "/booking/$bookingId/details",
      params: { bookingId: booking.id },
      replace: true,
    });
  }, [addressMissing, booking.id, navigate]);

  // **In the service's zone, never the device's.** See `slotWording`: the
  // instant is the same everywhere, the hour it is spoken of in is not, and a
  // page that prints the browser's answer tells the customer a different
  // appointment to the one the provider is expecting them for.
  const when = slotWording(booking.startsAt, booking.endsAt, locale, booking.timezone);

  function send() {
    // **The same rule the charge uses, not a laxer one.** `82` is a real
    // Mozambican prefix and not Vodacom's: accepted here, it would fail at
    // the charge instead — after the provider had already blocked their
    // calendar for it.
    const msisdn = toMpesaMsisdn(phone);
    if (!msisdn) {
      setRefusal(phone.trim() ? "notVodacom" : "required");
      return;
    }
    if (!address) return;

    setRefusal(null);
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
        // **Stays on this page.** The obvious destination, `/bookings`, is a
        // placeholder rendering "no bookings yet" — so navigating there would
        // answer a successful commitment by denying it happened, and the
        // obvious reaction to that is to book it again. This screen is also
        // the only one holding `respondBy`, which is the one fact the
        // customer now wants.
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
      <SiteHeader current="services" />

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
            the form's own submit: Enter in the phone field sends the request
            rather than doing nothing, and the button needs no `form`
            attribute pointing across the layout at it. */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <div className="mt-4 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
            <div className="min-w-0">
              <CheckoutSteps current="confirm" />
              <h1 className="type-h1 mt-4">{t("confirmTitle")}</h1>
              <p className="type-body mt-2 text-[var(--color-muted-foreground)]">
                {t("confirmIntro")}
              </p>

              <dl className="mt-8 grid gap-5 rounded-[var(--radius-card)] border border-[var(--color-border)] p-5">
                <div>
                  <dt className="type-caption text-[var(--color-muted-foreground)]">
                    {t("summaryWhen")}
                  </dt>
                  <dd className="type-body-medium mt-1 font-semibold">{when.date}</dd>
                  <dd className="type-body tabular-nums">
                    {t("slotRange", { start: when.start, end: when.end })}
                  </dd>
                </div>

                {address && (
                  <div>
                    <dt className="type-caption text-[var(--color-muted-foreground)]">
                      {t("summaryWhere")}
                    </dt>
                    <dd className="type-body-medium mt-1 font-semibold">{address.label}</dd>
                    <dd className="type-body">
                      {[address.line1, address.line2, address.district, address.city]
                        .filter(Boolean)
                        .join(", ")}
                    </dd>
                    {address.directions && (
                      <dd className="type-caption text-[var(--color-muted-foreground)]">
                        {address.directions}
                      </dd>
                    )}
                  </div>
                )}

                {details?.description.trim() && (
                  <div>
                    <dt className="type-caption text-[var(--color-muted-foreground)]">
                      {t("summaryNote")}
                    </dt>
                    <dd className="type-body mt-1 whitespace-pre-line">
                      {details.description.trim()}
                    </dd>
                  </div>
                )}
              </dl>

              {/* One method, stated. Not a radio group with one live option
                  and two greyed ones: a chooser offering a decision nobody
                  can make invites the customer to want what is not there. */}
              <section className="mt-8">
                <h2 className="type-h3 font-semibold">{t("paymentLegend")}</h2>
                <div className="mt-3 flex items-start gap-3 rounded-[var(--radius-card)] border border-[var(--color-border)] p-4">
                  <Smartphone
                    className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-primary)]"
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <p className="type-body-medium font-semibold">{t("paymentMpesa")}</p>
                    <p className="type-caption text-[var(--color-muted-foreground)]">
                      {t("paymentMpesaHint")}
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid max-w-sm gap-1.5">
                  <Label htmlFor="checkout-phone">{t("phoneLabel")}</Label>
                  <Input
                    id="checkout-phone"
                    // `tel` rather than `number`: a phone number is digits
                    // that may carry a `+` and spaces, and a numeric spinner
                    // over one is nonsense on a desktop and a decimal keypad
                    // on a phone.
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={phone}
                    onChange={(e) => {
                      setTypedPhone(e.target.value);
                      // Cleared the moment they start correcting it, or they
                      // read a refusal about a number they have already
                      // changed.
                      setRefusal(null);
                    }}
                    aria-invalid={refusal !== null}
                    aria-describedby="checkout-phone-hint"
                  />
                  <p id="checkout-phone-hint" className="type-caption text-[var(--color-muted-foreground)]">
                    {t("phoneHint")}
                  </p>
                  {refusal && (
                    <p role="alert" className="type-caption text-[var(--color-destructive)]">
                      {t(refusal === "required" ? "phoneRequired" : "phoneNotVodacom")}
                    </p>
                  )}
                </div>
              </section>

              <section className="mt-8">
                <h2 className="type-h3 font-semibold">{t("howItWorksTitle")}</h2>
                {/* The order money and commitment actually happen in, which
                    is the whole of what the reversal changed. Written without
                    a number of hours in it: the window is
                    `provider_response_minutes`, a live setting an
                    administrator can change, and a figure printed here would
                    be a second source of truth that goes stale silently. */}
                <ol className="type-body mt-3 grid list-decimal gap-2 pl-5 text-[var(--color-muted-foreground)]">
                  <li>{t("howItWorks1")}</li>
                  <li>{t("howItWorks2")}</li>
                  <li>{t("howItWorks3")}</li>
                </ol>
              </section>
            </div>

            {/* 100px, not 0: the site header is 84px and sticky, so a rail
                pinned to the top of the viewport would slide under it. */}
            <aside className="grid gap-4 lg:sticky lg:top-[100px]">
              <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] p-5">
                {/* `expiresAt` is nullable because the column is. The service
                    and the option are not: they come off the booking, so the
                    countdown always has somewhere to send the customer when
                    the hold lapses.

                    `sending` is what stops the last seconds of the hold from
                    navigating out from under a request that is landing — see
                    the prop's own doc comment. This is the only page that can
                    have a write in flight, which is why step 2 passes
                    nothing. */}
                {booking.expiresAt ? (
                  <div className="mb-4">
                    <CheckoutCountdown
                      expiresAt={booking.expiresAt}
                      serviceId={booking.serviceId}
                      optionId={booking.serviceOptionId}
                      sending={request.pending}
                    />
                  </div>
                ) : null}

                <p className="type-caption text-[var(--color-muted-foreground)]">
                  {booking.providerName}
                </p>
                <h2 className="type-h3 mt-1 font-semibold">{booking.serviceName}</h2>

                {/* The price the customer pays, exactly as the provider set
                    it. No fee line and no breakdown, because there is nothing
                    to break down: the commission comes out of the provider's
                    payout, so a split shown here would invent a charge the
                    customer is not being asked for. The query behind this
                    page does not even fetch it. */}
                <p className="type-h3 mt-4 font-semibold tabular-nums">
                  {formatAmount(booking.priceMinor, booking.currency, locale)}
                </p>
                <p className="type-caption mt-1 text-[var(--color-muted-foreground)]">
                  {booking.optionName}
                </p>

                {request.failed && (
                  <p role="alert" className="mt-4 text-sm text-[var(--color-destructive)]">
                    {request.errorCode
                      ? t(`submitError.${request.errorCode}`, {
                          defaultValue: t("submitErrorGeneric"),
                        })
                      : t("submitErrorGeneric")}
                  </p>
                )}

                <Button
                  type="submit"
                  className="mt-4 w-full"
                  disabled={request.pending || !address}
                >
                  {t("sendAction")}
                </Button>

                {/* The mockup's own promise, and the one sentence on this
                    page that would have been a lie under the old ordering.
                    Directly under the button rather than at the foot of the
                    card: it is the answer to what pressing it does. */}
                <p className="type-caption mt-3 text-center text-[var(--color-muted-foreground)]">
                  {t("nothingChargedNow")}
                </p>
              </div>
            </aside>
          </div>
        </form>
      </main>
    </>
  );
}
