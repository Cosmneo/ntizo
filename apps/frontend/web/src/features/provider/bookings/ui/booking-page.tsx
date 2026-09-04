import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "@tanstack/react-router";
import { ArrowLeft, CalendarDays, ChevronDown, FileText, User } from "lucide-react";
import { Button, Skeleton, cn } from "@ntizo/frontend-ui";
import { EmptyCard } from "@/shared/components/empty-card";
import { usePageHeader } from "@/shared/lib/page-header";
import { Section } from "@/features/provider/ui/settings-shell";
import { useActiveProvider } from "@/features/provider/viewmodel/use-active-provider";
import { slotWording } from "@/features/checkout/domain/slot-wording";
import { formatMoney } from "@/features/wallet/domain/money";
import {
  commissionRate,
  payoutMinor,
  shortReference,
  timeLeftWording,
} from "../domain/status";
import {
  useAnswerBooking,
  useCloseBooking,
  useProviderBooking,
} from "../viewmodel/use-provider-bookings";
import { BookingStatusBadge } from "./booking-status-badge";
import { DeclineDialog } from "./decline-dialog";

const CAPTION =
  "type-caption font-bold tracking-[0.14em] text-[var(--color-muted-foreground)] uppercase";

/**
 * The statuses whose copy may name the customer's contact and the exact
 * address.
 *
 * It chooses *which block to draw*, not what the page is allowed to know:
 * the reveal is the backend mapper's rule and those four fields arrive null
 * until the booking is paid. Deciding it twice would let a client-side
 * mistake read as a leak; deciding it here alone would let a mapper mistake
 * read as none.
 */
const REVEALED = new Set(["CONFIRMED", "MARKED_DONE", "COMPLETED", "DISPUTED"]);

/** What the strip above the page can be saying, and the sentence for each. */
type Notice =
  | "accepted"
  | "declined"
  | "already"
  | "error"
  | "markedDone"
  | "stillOngoing"
  | "closeError";

const NOTICE_KEY: Record<Notice, string> = {
  accepted: "bookings.accepted",
  declined: "bookings.declined",
  already: "bookings.alreadyAnswered",
  error: "bookings.actionError",
  markedDone: "bookings.markedDone",
  stillOngoing: "bookings.stillOngoingDone",
  closeError: "bookings.closeError",
};

/** The two that report a failure; the rest report something that worked. */
const FAILED: ReadonlySet<Notice> = new Set<Notice>(["error", "closeError"]);

/** The hop the platform records when it asks a provider to close a booking. */
const CLOSE_REMINDER = "close_reminder";

/**
 * One booking, for the page that decides it. The header is the decision:
 * name, status, reference, the two actions while it is waiting, and the
 * deadline. After the decision the actions leave and the header keeps the
 * record. Sections from `settings-shell` — the frames the settings page and
 * checkout's step 2 already draw — and a rail with the provider's arithmetic
 * and the timeline.
 */
export function BookingPage() {
  const { t, i18n } = useTranslation("provider");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const { activeProvider } = useActiveProvider();
  const { bookingId } = useParams({ strict: false }) as { bookingId: string };
  const providerId = activeProvider?.id ?? "";
  const query = useProviderBooking(providerId, bookingId);
  const { accept, decline } = useAnswerBooking(providerId);
  const { markDone, stillOngoing } = useCloseBooking(providerId);
  const [declining, setDeclining] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const b = query.data;

  usePageHeader(
    b ? b.customerFirstName : t("bookings.title"),
    b ? `${b.serviceName} · ${b.optionName}` : undefined,
  );
  // The countdown is measured from the moment the booking was answered for,
  // not from whenever React last re-rendered: a re-render for an unrelated
  // reason must not move the clock a minute while nothing about the data
  // changed. The same bargain the list makes.
  const now = useMemo(
    () => new Date(query.dataUpdatedAt || Date.now()),
    [query.dataUpdatedAt],
  );

  if (!activeProvider) return null;
  const slug = activeProvider.slug;

  const back = (
    <Link
      to="/provider/$slug/bookings"
      params={{ slug }}
      className="type-caption inline-flex items-center gap-1.5 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
    >
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
      {t("bookings.back")}
    </Link>
  );

  if (query.isLoading) {
    return (
      <div className="mx-auto grid max-w-6xl gap-4">
        {back}
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="mx-auto grid max-w-6xl gap-4">
        {back}
        <p role="alert" className="type-body text-[var(--color-destructive)]">
          {t("bookings.loadError")}
        </p>
      </div>
    );
  }
  if (!b) {
    return (
      <div className="mx-auto grid max-w-6xl gap-4">
        {back}
        <EmptyCard
          framed
          title={t("bookings.notFoundTitle")}
          body={t("bookings.notFoundBody")}
        />
      </div>
    );
  }

  const waiting = b.status === "AWAITING_PROVIDER";
  const revealed = REVEALED.has(b.status);
  const left = b.respondBy ? timeLeftWording(b.respondBy, now) : null;
  const when = slotWording(b.startsAt, b.endsAt, locale, b.timezone);
  const busy = accept.isPending || decline.isPending;
  const coarse = [b.addressDistrict, b.addressCity].filter(Boolean);

  /**
   * A booking can only be closed after the work it was sold for is over —
   * `Booking.markDone` refuses anything else — so the button is not offered
   * while the appointment is still ahead. `now` is the moment of the last
   * read, not this render's, which is the same bargain the countdown makes:
   * the two buttons appear on the next refetch after the appointment ends
   * rather than materialising mid-sentence.
   */
  const ended = new Date(b.endsAt).getTime() <= now.getTime();
  const closable = b.status === "CONFIRMED" && ended;
  /**
   * The platform has already asked for this one. `close_reminder` is that
   * question, recorded on the booking's own history — the only place this
   * read model carries it — and it is worth repeating on the page: seven days
   * of silence and the platform closes the booking itself.
   */
  const asked = closable && b.timeline.some((e) => e.reason === CLOSE_REMINDER);
  // The window the customer is standing in, while they are standing in it.
  const feedbackBy = b.status === "MARKED_DONE" ? b.expiresAt : null;
  // A refetch is running behind the press that caused it: the buttons are
  // pointed at data already known to be stale, and pressing again would send
  // a second mutation the backend will refuse.
  const closing = markDone.isPending || stillOngoing.isPending || query.isFetching;

  /** The timeline's format, shared with the two deadline lines above it. */
  const stamp = (iso: string) =>
    new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: b.timezone,
    }).format(new Date(iso));

  /**
   * A refused answer is nearly always a race — the customer cancelled, or the
   * deadline passed, while this page sat open — so the failure is reported as
   * the state it actually is and the page is re-read rather than left saying
   * something that is no longer true.
   *
   * `fallback` is what to say when the refusal is not that race: answering a
   * request and closing a finished job fail at opposite ends of a booking's
   * life, and "não foi possível responder" over a job that ended yesterday
   * would name the wrong action.
   */
  const failed = (fallback: Notice) => (error: unknown) => {
    const code = (error as { code?: string } | null)?.code;
    // Closed on the way out, not only on success. A decline that came back
    // refused otherwise leaves its dialog sitting over the notice explaining
    // why it failed, with "Recusar pedido" still pressable — an invitation to
    // send the same refused mutation again, over a page the refetch below has
    // already taken the header's own actions off. Closing a dialog that was
    // never open (the accept path) is a no-op, so the one handler covers both.
    setDeclining(false);
    setNotice(code === "BOOKING_INVALID_TRANSITION" ? "already" : fallback);
    void query.refetch();
  };
  const onError = failed("error");
  const onCloseError = failed("closeError");

  /**
   * What the strip is allowed to say, given what the page now knows.
   *
   * "Voltamos a perguntar daqui a uma semana" is a promise about a booking
   * that is still open, and `stillOngoing` is the one press here that can
   * lose its race without being told: the platform's sweep marks the same
   * booking done from the other side, the compare-and-swap drops the write,
   * and the mutation answers `{ bookingId }` all the same (see
   * `MarkBookingDoneCommand` — its own `execute` returns null for this, and
   * the GraphQL field has nowhere to put it). The read that follows is the
   * only witness, so a booking that came back no longer `CONFIRMED` replaces
   * the acknowledgement with what actually happened.
   *
   * `markedDone` needs no such repair: whoever won that race, the booking is
   * marked done and the customer has their three days, which is exactly what
   * the sentence says.
   */
  const shown: Notice | null =
    notice === "stillOngoing" && b.status !== "CONFIRMED"
      ? b.status === "MARKED_DONE"
        ? "markedDone"
        : "already"
      : notice;

  return (
    <div className="mx-auto max-w-6xl">
      {back}

      <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="type-h1">{b.customerFirstName}</h1>
            <BookingStatusBadge status={b.status} />
            <span className="type-caption rounded-full bg-[var(--color-muted)] px-2.5 py-1 font-semibold tabular-nums">
              {t("bookings.reference", { ref: shortReference(b.id) })}
            </span>
          </div>
          <p className="type-body mt-1 text-[var(--color-muted-foreground)]">
            {b.serviceName} · {b.optionName} ·{" "}
            {b.memberFirstName ?? t("bookings.memberAnyone")}
          </p>
          {waiting && left && (
            <p className="type-body-medium mt-1 font-semibold">
              {t("bookings.respondIn", { time: left })}
            </p>
          )}
          {feedbackBy && (
            <p className="type-body-medium mt-1 font-semibold">
              {t("bookings.feedbackBy", { time: stamp(feedbackBy) })}
            </p>
          )}
          {asked && (
            <p className="type-body mt-1 text-[var(--color-muted-foreground)]">
              {t("bookings.askedToClose")}
            </p>
          )}
        </div>
        {/* The two actions exist only while the booking is waiting for them.
            After the decision the header is a record, and a live "Aceitar"
            over a booking already accepted is an invitation to an error the
            backend would refuse. */}
        {waiting && (
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setDeclining(true)}
            >
              {t("bookings.decline")}
            </Button>
            <Button
              type="button"
              disabled={busy}
              onClick={() =>
                accept.mutate(b.id, { onSuccess: () => setNotice("accepted"), onError })
              }
            >
              {t("bookings.accept")}
            </Button>
          </div>
        )}
        {/* The same two-button shape one stage later: the job is over and the
            platform wants to know whether it is finished. Both wrap onto
            their own line on a phone rather than squeezing "Marcar como
            concluído" into half a screen. */}
        {closable && (
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
            <div className="flex w-full flex-wrap gap-2 sm:w-auto">
              <Button
                type="button"
                variant="outline"
                className="flex-1 sm:flex-none"
                disabled={closing}
                onClick={() =>
                  stillOngoing.mutate(b.id, {
                    onSuccess: () => setNotice("stillOngoing"),
                    onError: onCloseError,
                  })
                }
              >
                {t("bookings.stillOngoing")}
              </Button>
              <Button
                type="button"
                className="flex-1 sm:flex-none"
                disabled={closing}
                onClick={() =>
                  markDone.mutate(b.id, {
                    onSuccess: () => setNotice("markedDone"),
                    onError: onCloseError,
                  })
                }
              >
                {t("bookings.markDone")}
              </Button>
            </div>
            {/* Said before the press, not after it. Marking a job done starts
                a clock the provider cannot take back, and "Concluído. O
                cliente tem três dias" arriving only once it is running is
                the news a press late. */}
            <p className="type-caption w-full max-w-80 text-[var(--color-muted-foreground)]">
              {t("bookings.markDoneConfirm")}
            </p>
          </div>
        )}
        {/* Confirmed, but the appointment has not happened yet. Saying why the
            button is not there beats leaving a provider hunting for it. */}
        {b.status === "CONFIRMED" && !ended && (
          <p className="type-caption max-w-64 text-[var(--color-muted-foreground)]">
            {t("bookings.markDoneHint")}
          </p>
        )}
      </header>

      {shown && (
        <p
          role="status"
          className={cn(
            "type-body mt-4 rounded-[var(--radius-card-sm)] p-3",
            FAILED.has(shown)
              ? "bg-[color-mix(in_srgb,var(--color-destructive)_8%,transparent)]"
              : "bg-[var(--color-muted)]",
          )}
        >
          {t(NOTICE_KEY[shown])}
        </p>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="min-w-0">
          <Section
            icon={<CalendarDays className="h-5 w-5" />}
            title={t("bookings.section.appointment")}
            blurb={t("bookings.section.appointmentBlurb")}
          >
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className={CAPTION}>{t("bookings.when")}</dt>
                <dd className="type-body-medium mt-1 font-semibold">{when.date}</dd>
                <dd className="type-body tabular-nums">
                  {when.start} – {when.end}
                </dd>
              </div>
              <div>
                <dt className={CAPTION}>{t("bookings.duration")}</dt>
                <dd className="type-body mt-1">
                  {t("bookings.minutes", { count: b.durationMinutes })}
                </dd>
              </div>
              <div>
                <dt className={CAPTION}>{t("bookings.where")}</dt>
                <dd className="type-body mt-1">
                  {b.locationType ? t(`bookings.location.${b.locationType}`) : null}
                  {coarse.length > 0 && ` · ${coarse.join(", ")}`}
                </dd>
                {revealed && b.addressLine && (
                  <dd className="type-body">
                    {[b.addressLabel, b.addressLine].filter(Boolean).join(" · ")}
                  </dd>
                )}
                {revealed && b.addressDirections && (
                  <dd className="type-caption text-[var(--color-muted-foreground)]">
                    {b.addressDirections}
                  </dd>
                )}
              </div>
              <div>
                <dt className={CAPTION}>{t("bookings.with")}</dt>
                <dd className="type-body mt-1">
                  {b.memberFirstName ?? t("bookings.memberAnyone")}
                </dd>
              </div>
            </dl>
          </Section>

          <Section
            icon={<User className="h-5 w-5" />}
            title={t("bookings.section.customer")}
            blurb={t("bookings.section.customerBlurb")}
          >
            <p className="type-body-medium font-semibold">{b.customerFirstName}</p>
            {revealed ? (
              <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <dt className={CAPTION}>{t("bookings.phone")}</dt>
                  <dd className="type-body mt-1 tabular-nums">
                    {b.customerPhone ?? t("bookings.none")}
                  </dd>
                </div>
                <div>
                  <dt className={CAPTION}>{t("bookings.email")}</dt>
                  <dd className="type-body mt-1">
                    {b.customerEmail ?? t("bookings.none")}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="type-body mt-2 text-[var(--color-muted-foreground)]">
                {t("bookings.hiddenUntilPaid")}
              </p>
            )}
          </Section>

          {b.description && b.description.trim() !== "" && (
            <Section
              icon={<FileText className="h-5 w-5" />}
              title={t("bookings.section.note")}
              blurb={t("bookings.section.noteBlurb")}
            >
              <p className="type-body whitespace-pre-line">{b.description.trim()}</p>
            </Section>
          )}
        </div>

        <aside className="grid gap-4 lg:sticky lg:top-6">
          {/* The arithmetic in the order the provider does it: what the
              customer pays, what the platform takes out of it, and the number
              that actually arrives. The last one is the only one anybody
              plans around, so it is the one that is set in the large type. */}
          <section className="rounded-[var(--radius-card)] border border-[var(--color-border)] p-5">
            <h2 className={CAPTION}>{t("bookings.money")}</h2>
            <dl className="mt-3 grid gap-2">
              <div className="flex justify-between">
                <dt className="type-body">{t("bookings.price")}</dt>
                <dd className="type-body tabular-nums">
                  {formatMoney(b.priceMinor, b.currency, locale)}
                </dd>
              </div>
              <div className="flex justify-between text-[var(--color-muted-foreground)]">
                <dt className="type-body">
                  {t("bookings.commission", {
                    rate: commissionRate(b.commissionBps, locale),
                  })}
                </dt>
                <dd className="type-body tabular-nums">
                  −{formatMoney(b.commissionMinor, b.currency, locale)}
                </dd>
              </div>
              <div className="flex justify-between border-t border-[var(--color-border)] pt-2">
                <dt className="type-body-medium font-semibold">{t("bookings.payout")}</dt>
                <dd className="type-h3 font-semibold tabular-nums">
                  {formatMoney(payoutMinor(b), b.currency, locale)}
                </dd>
              </div>
            </dl>
          </section>

          <section className="rounded-[var(--radius-card)] border border-[var(--color-border)] p-5">
            <h2 className={CAPTION}>{t("bookings.timeline")}</h2>
            <ol className="mt-3 grid list-none gap-3 p-0">
              {b.timeline.map((e, i) => {
                // A token the locale file has no word for still gets a line:
                // "Estado alterado" over the timestamp says less than the
                // truth but never says something false, and a gap in the
                // history would be worse than a vague entry in it.
                const label = t(`bookings.timelineReason.${e.reason}`, {
                  defaultValue: t("bookings.timelineReason.unknown"),
                });
                return (
                  <li
                    key={`${e.at}-${e.reason}-${i}`}
                    aria-label={label}
                    className="grid grid-cols-[1rem_minmax(0,1fr)] gap-x-3"
                  >
                    {/* Hollow for a deadline still ahead, filled for
                        something that happened: the shape says which of the
                        two a line is without a second word for it. */}
                    <span
                      aria-hidden="true"
                      className={cn(
                        "mt-1.5 h-2.5 w-2.5 rounded-full",
                        e.pending
                          ? "border-2 border-[var(--color-primary)]"
                          : "bg-[var(--color-primary)]",
                      )}
                    />
                    <div>
                      <p
                        className={cn(
                          "type-body-medium",
                          e.pending
                            ? "text-[var(--color-muted-foreground)]"
                            : "font-semibold",
                        )}
                      >
                        {label}
                      </p>
                      <p className="type-caption text-[var(--color-muted-foreground)] tabular-nums">
                        {stamp(e.at)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>

          {/* Closed by default and never opened by accident: these are the
              ids support asks for, and they are worth nothing to the person
              running the workspace. */}
          <details className="rounded-[var(--radius-card)] border border-[var(--color-border)] p-5">
            <summary
              className={cn(CAPTION, "flex cursor-pointer list-none items-center justify-between")}
            >
              {t("bookings.technical")}
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            </summary>
            <dl className="mt-3 grid gap-2 break-all">
              <div>
                <dt className="type-caption text-[var(--color-muted-foreground)]">
                  {t("bookings.bookingId")}
                </dt>
                <dd className="type-caption tabular-nums">{b.id}</dd>
              </div>
              <div>
                <dt className="type-caption text-[var(--color-muted-foreground)]">
                  {t("bookings.serviceOptionId")}
                </dt>
                <dd className="type-caption tabular-nums">{b.serviceOptionId}</dd>
              </div>
              <div>
                <dt className="type-caption text-[var(--color-muted-foreground)]">
                  {t("bookings.memberId")}
                </dt>
                <dd className="type-caption tabular-nums">
                  {b.providerMemberId ?? t("bookings.none")}
                </dd>
              </div>
              <div>
                <dt className="type-caption text-[var(--color-muted-foreground)]">
                  {t("bookings.paymentRef")}
                </dt>
                <dd className="type-caption tabular-nums">
                  {b.paymentRef ?? t("bookings.none")}
                </dd>
              </div>
            </dl>
          </details>
        </aside>
      </div>

      <DeclineDialog
        open={declining}
        onOpenChange={setDeclining}
        busy={decline.isPending}
        onConfirm={(reason) =>
          decline.mutate(
            { bookingId: b.id, reason },
            {
              onSuccess: () => {
                setDeclining(false);
                setNotice("declined");
              },
              onError,
            },
          )
        }
      />
    </div>
  );
}
