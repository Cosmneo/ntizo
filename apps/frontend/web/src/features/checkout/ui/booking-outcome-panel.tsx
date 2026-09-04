import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { CalendarCheck, CalendarX, Send, Smartphone } from "lucide-react";
import { EmptyCard } from "@/shared/components/empty-card";
import type { CheckoutBooking } from "@/features/checkout/viewmodel/use-checkout";
import type { CheckoutOutcome } from "@/features/checkout/domain/booking-outcome";
import { momentWording } from "@/features/checkout/domain/slot-wording";

/**
 * Where a customer goes from a page whose errand is finished: their own
 * booking first, browsing second.
 *
 * `/bookings` was a placeholder for as long as this panel existed — see
 * `bookings.$bookingId.tsx` — so every outcome here used to send a customer
 * who had just committed nowhere near the thing they had just done. It reads
 * real rows now, and the booking's own page is the honest answer to "what
 * happens to this one next": the same page whether they arrive from here, a
 * notification, or the list. "Ver outros serviços" stays, quieter, for
 * somebody who came to book something else and has no interest in the one
 * they just finished.
 */
export function BrowseMoreLink({ bookingId }: { bookingId: string }) {
  const { t } = useTranslation("checkout");
  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      <Link
        to="/bookings/$bookingId"
        params={{ bookingId }}
        className="rounded-full bg-[var(--color-primary)] px-5 py-2 text-sm font-semibold text-white hover:opacity-90"
      >
        {t("viewBookingAction")}
      </Link>
      <Link
        to="/services"
        search={{}}
        className="type-caption font-medium text-[var(--color-muted-foreground)] hover:underline"
      >
        {t("browseMoreAction")}
      </Link>
    </div>
  );
}

/** Back to step 1, on the package this booking was for, as a choice rather than a redirect. */
function PickAnotherTimeLink({ booking }: { booking: CheckoutBooking }) {
  const { t } = useTranslation("checkout");
  return (
    <Link
      to="/book/$serviceId"
      params={{ serviceId: booking.serviceId }}
      search={{ optionId: booking.serviceOptionId }}
      className="rounded-full bg-[var(--color-primary)] px-5 py-2 text-sm font-semibold text-white hover:opacity-90"
    >
      {t("unansweredAction")}
    </Link>
  );
}

/**
 * The request is with the provider — the screen checkout actually ends on.
 *
 * **It ends here rather than navigating**, which is the point: this is the
 * only page that knows what was sent and by when it has to be answered, and
 * the obvious destination denies the booking exists at all. So the customer
 * reads back the commitment they just made and the deadline the other side is
 * now held to.
 *
 * `deadline` is nullable because `expiresAt` is — the column is. Every path
 * into `AWAITING_PROVIDER` stamps it (`SubmitBookingCommand` computes it and
 * `Booking.submit` writes it), so this is a shape the type permits and the
 * flow does not produce: the sentence loses its deadline rather than gaining
 * an invented one.
 */
export function SentPanel({
  booking,
  deadline,
}: {
  booking: CheckoutBooking;
  deadline: string | null;
}) {
  const { t, i18n } = useTranslation("checkout");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  // The service's zone, exactly as the slot was rendered in. A deadline in
  // the browser's zone beside a slot in the provider's would put two clocks
  // on one page, and make whichever the customer checked look wrong.
  const by = deadline ? momentWording(deadline, locale, booking.timezone) : null;

  return (
    <EmptyCard
      framed
      badge={Send}
      title={t("sentTitle")}
      body={
        by
          ? t("sentBody", { provider: booking.providerName, date: by.date, time: by.time })
          : t("sentBodyNoDeadline", { provider: booking.providerName })
      }
      action={<BrowseMoreLink bookingId={booking.id} />}
    />
  );
}

/**
 * What a checkout page shows for a booking that is no longer its to finish.
 *
 * **One component, because both steps land here and they were telling
 * opposite stories.** Step 3 knew that an `EXPIRED` request means the
 * provider never answered; step 2 fell through to a catch-all and told the
 * same customer, one back-press later, that "the provider will answer as soon
 * as they can". Two panels drawn from one reading of the booking is the fix;
 * a second copy of the branch is how it came back.
 *
 * **Each outcome gets an answer that is true of it**, rather than the eight
 * non-draft statuses sharing one sentence. `awaitingPayment` is the sharp
 * one: an operator hand-accepts a request (the stated mode this phase), the
 * charge sweep pushes an M-Pesa prompt, and the customer has a window in
 * which to do something. Told instead that there is nothing left to do, they
 * do nothing, the window closes, the booking is `CANCELLED`, and the provider
 * is told the customer did not pay.
 *
 * `deadline` is not printed for anything but `awaitingProvider`: `expiresAt`
 * past that status is somebody else's clock, and a countdown or a deadline
 * drawn from it would be checkout counting a window it has no part in.
 */
export function BookingOutcomePanel({
  booking,
  outcome,
}: {
  booking: CheckoutBooking;
  /**
   * Never `"draft"` or `"released"` — both are handled by the page before it
   * gets here, one by rendering its form and the other by navigating away.
   * Excluded in the type so a page that forgets cannot reach a panel with no
   * answer for it.
   */
  outcome: Exclude<CheckoutOutcome, "draft" | "released">;
}) {
  const { t } = useTranslation("checkout");

  switch (outcome) {
    case "awaitingProvider":
      // The deadline comes off `expiresAt`, which on an `AWAITING_PROVIDER`
      // booking *is* the `respondBy` the send answered with —
      // `bookingReadModel` says so — which is how a refresh, or the back
      // button onto step 2, tells the same story as the just-sent screen
      // without keeping anything of its own.
      return <SentPanel booking={booking} deadline={booking.expiresAt} />;

    case "unanswered":
      return (
        <EmptyCard
          framed
          badge={CalendarX}
          title={t("unansweredTitle")}
          body={t("unansweredBody")}
          // Offered, not imposed: picking another time is a choice they make.
          action={<PickAnotherTimeLink booking={booking} />}
        />
      );

    case "declined":
      return (
        <EmptyCard
          framed
          badge={CalendarX}
          title={t("declinedTitle")}
          body={t("declinedBody")}
          action={<PickAnotherTimeLink booking={booking} />}
        />
      );

    case "awaitingPayment":
      return (
        <EmptyCard
          framed
          badge={Smartphone}
          title={t("awaitingPaymentTitle")}
          body={t("awaitingPaymentBody")}
          // **No action, deliberately.** What this customer has to do is on
          // their handset, and every link this page could offer would lead
          // away from it. A button here would read as the way to finish.
        />
      );

    case "paymentLapsed":
      return (
        <EmptyCard
          framed
          badge={CalendarX}
          title={t("paymentLapsedTitle")}
          body={t("paymentLapsedBody")}
          action={<PickAnotherTimeLink booking={booking} />}
        />
      );

    case "paid":
      return (
        <EmptyCard
          framed
          badge={CalendarCheck}
          title={t("paidTitle")}
          body={t("paidBody")}
          action={<BrowseMoreLink bookingId={booking.id} />}
        />
      );
  }
}
