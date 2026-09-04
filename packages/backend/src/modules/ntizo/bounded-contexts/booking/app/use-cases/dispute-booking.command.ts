import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
import { NotificationType } from "@ntizo/shared";
import type { Booking } from "../../domain/aggregates/booking.aggregate";
import { BookingNotFoundError, NotBookingCustomerError } from "../../domain/exceptions";
import type { AdminUserReaderPort } from "../ports/outbound/admin-user-reader.port";
import type { BookingRepositoryPort } from "../ports/outbound/booking.repository.port";
import type {
  DisputeAttachment,
  OpenDisputeThreadPort,
} from "../ports/outbound/open-dispute-thread.port";
import {
  raiseQuietly,
  type RaiseNotificationInternalPort,
} from "../ports/outbound/raise-notification.port";

/**
 * What `booking_change.reason` records for this hop.
 *
 * A machine token rather than a sentence, the contract every reason in this
 * directory keeps: a booking's history renders into eight locales, and a
 * locale key can be switched on where English prose can only be shown
 * verbatim.
 *
 * One member, not a union, because there is exactly one way into `DISPUTED`
 * and exactly one person who may take it. An administrator cannot dispute on
 * a customer's behalf — the thread this hop opens is the customer's own
 * account of what went wrong, and nobody else has one to give.
 */
const DISPUTED_BY_CUSTOMER = "disputed_by_customer";

/**
 * The longest subject `support_request.subject` will hold — `varchar(120)`,
 * which the communication context also enforces in
 * `SupportRequest.normaliseSubject` by *refusing* anything longer.
 *
 * Repeated here rather than imported, the same way every other cross-context
 * value in this directory is: no `app/` tree imports another context's. The
 * cost of getting it wrong is not cosmetic — a service whose name runs past
 * this would have its dispute refused outright by a rule this side cannot
 * see, so the trim happens here, before the port is ever called.
 */
const SUBJECT_MAX = 120;

export interface DisputeBookingInput {
  bookingId: string;
  /** From `requireUser` at the GraphQL layer, never from the client. */
  requesterUserId: string;
  message: string;
  attachments: readonly DisputeAttachment[];
}

/**
 * The customer says something is wrong, inside the three days they were
 * given. A thread opens with their account of it, the booking moves to
 * `DISPUTED`, and every clock on it stops until an administrator decides.
 *
 * **The dispute has two halves that do not know each other.** The booking's
 * status belongs to this context; the conversation, its attachments and its
 * access control belong to Communication, which already has all of it — a
 * dispute is a support request with `kind = 'dispute'` and a booking id.
 * `OpenDisputeThreadPort` is how this side asks for the second half without
 * importing it, exactly as `RaiseNotificationInternalPort` is for
 * notifications.
 *
 * **The thread is opened before the transaction, and that ordering is the
 * design.** It is another bounded context's write: inside this context's
 * transaction it would be exposed to a rollback that has nothing to do with
 * it, and — against a real database, where Communication's writes go through
 * their own connection — would not actually be rolled back anyway, leaving
 * the two contexts disagreeing about whether the conversation exists.
 *
 * The cost of that ordering is stated rather than hidden: **if the
 * compare-and-swap below loses after the thread has been opened, the thread
 * stands as an ordinary support request about this booking and the booking
 * stays where it was.** An administrator reading the queue sees a
 * conversation whose booking is not `DISPUTED`. That is the smaller wrong —
 * an orphaned conversation somebody can read and act on, against a dispute
 * whose thread never opened, which is a customer telling the platform
 * something and the platform losing it. This plan's closing task writes it
 * into `docs/superpowers/follow-ups.md` as "A dispute's thread can outlive
 * its dispute"; the trigger is a support request of kind `dispute` whose
 * booking is not `DISPUTED` turning up in the queue, and the fix then is a
 * reconciliation on open, or an outbox hop.
 *
 * **The booking is read once, outside the transaction**, unlike every other
 * command in this directory. It has to be: the ownership check and the
 * transition guard both have to run *before* the port call, or a booking
 * nobody is entitled to dispute — or one that is not in its window at all —
 * leaves a support thread behind it as the price of being refused. The
 * compare-and-swap on `save` is what makes the wider window between that read
 * and the write safe, which is the job it does for every other command here
 * too.
 *
 * **It takes no outbox, and that absence is the design rather than an
 * omission.** There is no `booking.disputed` event in `domain/events`, and
 * inventing one here would be inventing a contract with no consumer to keep
 * it for — the fact reaches the two audiences that act on it (the provider,
 * and every administrator) as notifications, and reaches the administrator's
 * queue as the row's own status. So this command does not hold a port it
 * would never call, the same shape `KeepBookingOpenCommand` has for its
 * notification port and `CreateBookingCommand` for the same one. The
 * *resolution* does publish, because both of its outcomes already have events
 * whose reasons were declared for exactly that hop; see
 * `ResolveBookingDisputeCommand`.
 *
 * **Every raise happens after the transaction resolves, and only on the
 * applied path** (BR-P6), the same discipline every other command in this
 * directory keeps.
 */
export class DisputeBookingCommand {
  constructor(
    private readonly repo: BookingRepositoryPort,
    private readonly disputeThreads: OpenDisputeThreadPort,
    private readonly adminUsers: AdminUserReaderPort,
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly raiseNotification: RaiseNotificationInternalPort,
  ) {}

  async execute(input: DisputeBookingInput): Promise<{ threadId: string }> {
    // Computed once, before the transition — the instant this command ran.
    const at = new Date();

    const booking = await this.repo.findById(input.bookingId);
    if (!booking) {
      throw new BookingNotFoundError(input.bookingId);
    }

    // Only the booking's own customer, and the same error `SubmitBookingCommand`
    // throws for the same fact rather than a second way of saying it.
    if (booking.customerId !== input.requesterUserId) {
      throw new NotBookingCustomerError();
    }

    // The transition is computed here, ahead of the port call, so a booking
    // outside its window is refused before anybody opens a conversation about
    // it. `dispute` throws `BookingTransitionError` from any status but
    // `MARKED_DONE`; the guard is the aggregate's, not a copy of it kept in
    // this layer.
    const next = booking.dispute(at);

    const { threadId } = await this.disputeThreads.execute({
      bookingId: input.bookingId,
      requesterUserId: input.requesterUserId,
      // What was bought, as the subject — no invented sentence and no locale
      // to pick. `kind = 'dispute'` is what tells the queue this is a
      // complaint rather than a question, which is the whole reason Task 2
      // added that column instead of inferring it from the subject or from
      // "has a booking id".
      subject: booking.serviceName.slice(0, SUBJECT_MAX),
      message: input.message,
      attachments: input.attachments,
    });

    const moved = await this.unitOfWork.atomicExecute(async () => {
      const applied = await this.repo.save(next, booking.status);
      if (!applied) {
        // The row no longer holds the status this command's read saw — an
        // administrator completing it, or the sweep closing the window, in
        // the seconds this dispute took to open its thread. Nothing is
        // written and nothing is announced: `next` describes a world that no
        // longer exists. The thread survives; see this class's own doc
        // comment for why that is the outcome to prefer.
        return null;
      }

      // Who disputed, and when. Every `previous*` field is null because this
      // hop moved none of them: it changed the status and erased a deadline,
      // and both live on the booking.
      await this.repo.appendChange({
        bookingId: input.bookingId,
        changedByUserId: input.requesterUserId,
        reason: DISPUTED_BY_CUSTOMER,
        previousStartsAt: null,
        previousEndsAt: null,
        previousProviderMemberId: null,
        previousPriceMinor: null,
      });

      return next;
    });

    if (!moved) {
      return { threadId };
    }

    // The provider first: they are the party the complaint is about, and the
    // thread id is what lets them read and answer it.
    await raiseQuietly(
      this.raiseNotification,
      {
        type: NotificationType.BookingDisputed,
        audience: "provider",
        providerId: moved.providerId,
        payload: {
          bookingId: input.bookingId,
          serviceName: moved.serviceName,
          threadId,
        },
      },
      input.bookingId,
    );

    await this.tellAdministrators(moved, input.bookingId, threadId);

    return { threadId };
  }

  /**
   * One notification per administrator, each in its own `raiseQuietly` — the
   * same shape and the same posture as `SweepBookingCommand.tellAdministrators`,
   * and for the same reasons.
   *
   * **Reading the list is allowed to fail, and failing tells nobody rather
   * than undoing the dispute.** The booking has already committed by the time
   * this runs, so an exception here could only cost the announcement — and
   * letting it out would turn a recorded dispute into a failed mutation the
   * customer would reasonably try again, opening a second thread.
   * `console.error` rather than the request-scoped logger, which is the same
   * choice `raiseQuietly` itself makes two lines below — a dispute's two
   * failure logs coming out through different channels would be worse than
   * either channel being the wrong one.
   *
   * An empty list is not an error: a platform with no administrators records
   * the dispute and tells nobody, which is the honest outcome.
   */
  private async tellAdministrators(
    booking: Booking,
    bookingId: string,
    threadId: string,
  ): Promise<void> {
    let adminIds: string[];
    try {
      adminIds = await this.adminUsers.findAdminUserIds();
    } catch (error) {
      console.error("[booking] could not list administrators for a disputed booking", {
        bookingId,
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    for (const userId of adminIds) {
      await raiseQuietly(
        this.raiseNotification,
        {
          type: NotificationType.BookingDisputed,
          audience: "user",
          userId,
          payload: {
            bookingId,
            serviceName: booking.serviceName,
            // The provider by id and by name, the same pair
            // `AdminBookingAutoClosed` carries: the id is what the admin
            // queue filters on, and the name is what a person reads.
            providerId: booking.providerId,
            providerName: booking.providerName,
            threadId,
          },
        },
        bookingId,
      );
    }
  }
}
