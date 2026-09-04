import { infraStore } from "@ntizo/backend/shared/infra";
import { closeDbBehindDeferredWork } from "@ntizo/backend/shared/infra/database";
import type { Stage } from "@ntizo/backend/shared/infra/config";
import { bootstrapNotification } from "@ntizo/backend/modules/ntizo/bounded-contexts/notification";
import { bootstrapCommunication } from "@ntizo/backend/modules/ntizo/bounded-contexts/communication";
import {
  bootstrapBooking,
  type OpenDisputeThreadPort,
} from "@ntizo/backend/modules/ntizo/bounded-contexts/booking";
import { AttachmentStorageAdapter } from "./attachment-storage.adapter";
import { disputeThreadOver } from "./dispute-thread.adapter";
import type { AppBindings } from "./types";

/**
 * How many due messages one sweep may claim.
 *
 * The cron runs every minute (see `wrangler.jsonc`) against a two-minute
 * notify window, so under any plausible load one wave clears the queue
 * before the next wave starts. This is a generous ceiling against a runaway
 * backlog, not a throttle a normal run is expected to hit.
 */
export const SWEEP_LIMIT = 200;

/**
 * How many due bookings one sweep may claim.
 *
 * The cron runs every minute (see `wrangler.jsonc`) against three
 * administrator-configured windows, not one: the checkout hold a `DRAFT`
 * stands on, the response window an `AWAITING_PROVIDER` gives the provider,
 * and the payment window a `PENDING_PAYMENT` gives the customer — all
 * `platform_settings` columns, all read through `PlatformSettingsReaderPort`
 * in the booking bounded context, the shortest of them measured in minutes.
 * Under any plausible load whatever went stale in the last minute across all
 * three is a small fraction of this ceiling, and one wave clears it before
 * the next wave starts. Shorter windows only shrink the possible backlog
 * further, so 200 stays a generous ceiling against a runaway backlog either
 * way — not a throttle a normal run is expected to hit — kept as its own
 * constant, not a reuse of `SWEEP_LIMIT` above, because the two sweeps are
 * budgeting against different windows on different tables and have no reason
 * to share a number just because it currently matches.
 */
export const BOOKING_SWEEP_LIMIT = 200;

/**
 * How many accepted bookings one wave may charge.
 *
 * **Two orders of magnitude below the two limits above, and the arithmetic is
 * the reason.** Those sweeps do database work: two hundred rows is two
 * hundred short transactions and a wave finishes in well under a second. A
 * charge is an M-Pesa C2B, which *blocks* — it pushes a prompt to a handset
 * and does not answer until the customer accepts, refuses, or about sixty
 * seconds pass (measured: `INS-9 Request timeout` at 62s against the live
 * sandbox). They cannot be run in parallel either: this scope's Postgres pool
 * is `{ max: 1 }`, so concurrent charges would interleave transactions on one
 * connection. So a wave costs roughly `limit × 60s`, and five is what fits
 * comfortably inside a scheduled invocation's wall-clock budget with room for
 * the two sweeps that ran before it.
 *
 * A backlog is not lost, only spread: the cron wakes again in sixty seconds,
 * and `ChargeAcceptedBookingsInternalCommand`'s own cooldown means the next
 * wave picks up different bookings rather than re-prompting these. Five per
 * minute is three hundred bookings an hour, against a payment window measured
 * in minutes — far past anything this platform's volume requires, and the
 * number to revisit first if it ever isn't.
 */
export const BOOKING_CHARGE_LIMIT = 5;

/**
 * The dispute-thread port `bootstrapBooking` requires, for a caller that will
 * never open a dispute.
 *
 * The cron reaches `internal.sweepDue` and `internal.chargeAccepted` and
 * nothing else, and neither of those can dispute anything — but a bootstrap
 * that constructs every use case constructs `DisputeBookingCommand` too, so
 * it needs the real port and not a stub. Same situation as the
 * `AttachmentStorageAdapter` this file already hands `bootstrapCommunication`
 * for a sweep that never touches an attachment.
 *
 * The communication graph behind it is built **inside `execute`**, so a run
 * that never disputes never builds it — which is every run. Constructing it
 * eagerly would also mean reaching for a binding declared in another `try`
 * block, tying the two sweeps' failure modes back together; see the comments
 * at each call site for why that was undone.
 *
 * **Do not read this as a working example.** "Never called" is not the same
 * claim as "would work if it were", and this one would not: the
 * `AttachmentStorageAdapter` above is constructed outside
 * `runWithAttachmentsBucket`, which is what binds the request's
 * `ATTACHMENTS_BUCKET` for it to find (see `graphql/private.ts`, where the
 * same adapter is wrapped per request). A dispute carrying attachments would
 * fail here. Nothing in the cron opens one, so nothing exercises that today —
 * but a future scheduled arm that genuinely needs to open a thread has to
 * establish the bucket scope first, not copy this function.
 */
function disputeThreadForCron(): OpenDisputeThreadPort {
  return {
    execute: (input) =>
      disputeThreadOver(
        bootstrapCommunication({
          raiseNotification: bootstrapNotification().useCases.internal.raiseNotification,
          attachmentStorage: new AttachmentStorageAdapter(),
        }).useCases.openSupportRequest,
      ).execute(input),
  };
}

/**
 * The worker that wakes up to check for unread messages.
 *
 * Nothing calls `NotifyUnreadInternalCommand` unless something schedules it —
 * this is that something. Without it, every message is composed, stored, and
 * nobody is ever told: `notifyDueAt` sits in the table forever and the sweep
 * that would turn it into a bell-plus-email notification never runs.
 *
 * **A `scheduled` handler is not an HTTP request.** `configMiddleware`
 * establishes the request-scoped `infraStore` AsyncLocalStorage context for
 * every fetch. A cron invocation has no request for that middleware to wrap,
 * so this function builds the same context by hand (`infraStore.runAsync`
 * below) — the only other place in this codebase that does. Deep inside
 * the sweep, `DeferredNotificationDelivery.execute()` calls
 * `infraStore.waitUntil(...)` and template rendering reads
 * `infraStore.getEnv()` for `APP_URL`; both throw ("not initialized... Ensure
 * configMiddleware wraps the request") outside that scope. Worse, the raise
 * and `markNotified` happen *before* the deferred email delivery is awaited,
 * so an unwrapped call would still mark every message notified while its
 * email throws inside `DeferredNotificationDelivery`'s own `.catch` and
 * vanishes — permanent, silent email loss with every test green. Hence the
 * context built below, before anything that reads it runs.
 *
 * The per-request `{ max: 1 }` postgres pool this scope opens has the same
 * problem `configMiddleware` solves for a request: the sweep defers email
 * delivery past its own return, and Cloudflare does not order `waitUntil`
 * tasks against each other, so the close must be chained *behind* the
 * deferred work rather than scheduled beside it. Shares
 * `closeDbBehindDeferredWork` with `configMiddleware` rather than
 * hand-copying that chain a second time — see that function's own doc
 * comment for the full argument.
 *
 * **The booking sweep runs in this same scope, not a second one of
 * its own.** A booking's `expires_at` — whichever of the three windows
 * stamped it — is the same shape of question against the same clock as a
 * message's `notifyDueAt`, and this
 * function already builds the one context a cron invocation needs — a
 * second `infraStore.runAsync` would mean a second `{ max: 1 }` connection
 * and a second close racing this one. Unlike the notification sweep,
 * `SweepDueBookingsInternalCommand` defers nothing past its own `await`:
 * each booking's transaction commits and its outbox dispatch runs
 * synchronously inside `SweepBookingCommand.execute`, so it needs nothing
 * from `infraStore.waitUntil` — it only needs the DB context this scope
 * already set up.
 *
 * **So does the charge sweep, which is the third question this handler
 * asks.** The first two are about clocks — is a message still unread, has a
 * booking's deadline passed. The third is about money: which accepted
 * bookings still owe a charge (`ChargeAcceptedBookingsInternalCommand`). It
 * needs the same DB context and, like the booking sweep, nothing from
 * `waitUntil`; unlike either of the others it also needs the M-Pesa
 * credentials carried into the env below, and it is the only one of the three
 * whose runtime is measured in minutes rather than milliseconds — see
 * `BOOKING_CHARGE_LIMIT`.
 */
export async function scheduled(
  controller: ScheduledController,
  env: AppBindings,
  ctx: ExecutionContext,
): Promise<void> {
  await infraStore.runAsync(
    {
      STAGE: (env.STAGE as Stage) ?? "local",
      LOG_LEVEL: env.LOG_LEVEL ?? "info",
      DATABASE_URL: env.DATABASE_URL ?? "",
      BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET ?? "dev-secret-change-me",
      RESEND_API_KEY: env.RESEND_API_KEY ?? "",
      EMAIL_FROM: env.EMAIL_FROM ?? "Ntizo <noreply@ntizo.co.mz>",
      // Same fallback configMiddleware uses: a notification email carrying a
      // link to nowhere is worse than one that only works in dev.
      APP_URL: env.APP_URL ?? "http://localhost:3000",
      GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID ?? "",
      GOOGLE_CLIENT_SECRET: env.GOOGLE_CLIENT_SECRET ?? "",
      // No `?? ""` on these, unlike every binding above: the adapter that
      // reads them distinguishes "absent" from "present", and an empty string
      // would be a value that fails at the gateway instead of a stage that
      // says it is not configured. This is the one scope that actually needs
      // them — the charge runs from this cron and nowhere else today.
      MPESA_API_KEY: env.MPESA_API_KEY,
      MPESA_PUBLIC_KEY: env.MPESA_PUBLIC_KEY,
      MPESA_ENVIRONMENT: env.MPESA_ENVIRONMENT,
      MPESA_ORIGIN: env.MPESA_ORIGIN,
      MPESA_SERVICE_PROVIDER_CODE: env.MPESA_SERVICE_PROVIDER_CODE,
      CONTACT_INBOX_EMAIL: env.CONTACT_INBOX_EMAIL,
    },
    async () => {
      infraStore.setHyperdrive(
        (env as unknown as { HYPERDRIVE?: { connectionString: string } }).HYPERDRIVE,
      );
      // No accept-language / timezone to carry: those come off a request
      // header and a cron invocation has no request. Registered before the
      // sweep runs, same as configMiddleware registers it before `next()`,
      // so deferred work started inside the sweep can hand the platform its
      // own promise.
      infraStore.setWaitUntil(ctx.waitUntil.bind(ctx));

      try {
        // Its own try, not shared with the booking sweep below (see that
        // block's own comment for why): a throw here — Communication down,
        // a DB error before `notifyUnread`'s own per-message try/catch even
        // starts — must not skip the booking sweep, an unrelated context with
        // its own permanent-slot-leak problem to prevent.
        try {
          const notification = bootstrapNotification();
          const communication = bootstrapCommunication({
            raiseNotification: notification.useCases.internal.raiseNotification,
            // Never actually called: the sweep only ever reaches
            // `useCases.internal.notifyUnread`, which `bootstrapCommunication`
            // wires independently of `sendMessage` — required here only
            // because `bootstrapCommunication` always constructs
            // `SendMessageCommand` too.
            attachmentStorage: new AttachmentStorageAdapter(),
          });

          const { notified, failed } = await communication.useCases.internal.notifyUnread.execute({
            limit: SWEEP_LIMIT,
          });

          if (failed > 0) {
            // console.error, not the logger: getRequestScopedLogger() throws
            // when no scope is set and a cron invocation sets none — same
            // reason notify-unread.internal.command.ts does this itself.
            console.error(
              `[scheduled] notify-unread sweep: ${notified} notified, ${failed} failed`,
            );
          }
        } catch (error) {
          console.error("[scheduled] notify-unread sweep threw", error);
        }

        // Its own try too: this sweep must run — and must be judged on its
        // own outcome — whether or not the one above threw. Before Task 5 of
        // the booking-seams repair plan, both sweeps shared one `try` with
        // notification first, so anything Communication threw skipped
        // the booking sweep entirely, reinstating the permanent slot leak that
        // sweep exists to prevent, from a context that has nothing to do
        // with bookings.
        try {
          // Its own `bootstrapNotification()` rather than the one inside the
          // block above: reaching across the two `try` blocks for a binding
          // declared in one of them would tie their failure modes back
          // together, which is exactly what splitting them undid. Both are
          // cheap object graphs over the same request-scoped `getDb()`.
          const booking = bootstrapBooking({
            raiseNotification: bootstrapNotification().useCases.internal.raiseNotification,
            // Never called from here — see `disputeThreadForCron`.
            openDisputeThread: disputeThreadForCron(),
          });
          const { swept, failed: bookingFailed } = await booking.useCases.internal.sweepDue.execute({
            limit: BOOKING_SWEEP_LIMIT,
          });

          if (bookingFailed > 0) {
            // Same reasoning as the notify-unread log above: no request scope
            // exists for getRequestScopedLogger() to read. "swept", not
            // "expired": two of the three clocks end in `EXPIRED` and the
            // third ends in `CANCELLED`, and this line cannot tell them
            // apart — see `SweepDueBookingsInternalCommand.execute`.
            console.error(
              `[scheduled] booking sweep: ${swept} swept, ${bookingFailed} failed`,
            );
          }
        } catch (error) {
          console.error("[scheduled] booking sweep threw", error);
        }

        // The cron's third question, and its own `try` for the same reason
        // the second one has one: it must run whether or not either sweep
        // above threw, and it must be judged on its own outcome. It is also
        // the only one of the three that spends real time — see
        // `BOOKING_CHARGE_LIMIT` — so it goes last, after the two cheap
        // questions have already been answered. Ordering it after the
        // deadline sweep is not only about cost: that sweep cancels bookings
        // whose payment window has closed, and running it first means this
        // one never pushes a prompt at a booking that was about to be
        // cancelled anyway. (The two queries are disjoint on `expires_at`
        // regardless — see `findAwaitingCharge` — so the ordering is a
        // second line of defence, not the only one.)
        //
        // A fresh `bootstrapBooking()` rather than reusing the one above:
        // both are cheap object graphs over the same request-scoped `getDb()`,
        // and reaching across the two `try` blocks for a binding declared
        // inside one of them would tie their failure modes back together,
        // which is exactly what splitting them undid.
        try {
          const booking = bootstrapBooking({
            raiseNotification: bootstrapNotification().useCases.internal.raiseNotification,
            // Never called from here either — see `disputeThreadForCron`.
            openDisputeThread: disputeThreadForCron(),
          });
          const { attempted, failed: chargeFailed } =
            await booking.useCases.internal.chargeAccepted.execute({
              limit: BOOKING_CHARGE_LIMIT,
            });

          if (chargeFailed > 0) {
            // Same reasoning as the two logs above: no request scope exists
            // for getRequestScopedLogger() to read. "attempted", not
            // "charged": most attempts that do not become money are the
            // ordinary case (a customer who never answers), and only a throw
            // counts as failed here — see that command's own doc comment.
            console.error(
              `[scheduled] booking charge sweep: ${attempted} attempted, ${chargeFailed} failed`,
            );
          }
        } catch (error) {
          console.error("[scheduled] booking charge sweep threw", error);
        }
      } finally {
        // Workers run nothing after this function returns unless scheduled —
        // and the deferred work scheduled above still needs this run's
        // `{ max: 1 }` postgres pool for recipients, suppressions and
        // delivery rows. See `closeDbBehindDeferredWork`'s doc comment.
        closeDbBehindDeferredWork((promise) => ctx.waitUntil(promise));
      }
    },
  );
}
