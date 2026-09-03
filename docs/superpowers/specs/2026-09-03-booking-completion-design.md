# Closing a Booking — Design

**Status:** approved in conversation, 2026-09-03. Third phase of the provider booking line, after
Reservas (phase 1) and Visão geral (phase 2), both merged and deployed to dev.

## What this is

A booking in this platform has no ending. `accept` and `decline` answer a request, `markPaid`
turns an accepted request into a commitment, and then the booking sits at `CONFIRMED` forever —
through the appointment, past it, and for the rest of the workspace's life. The provider's
history tab shows a job from last March as "Confirmada". The dashboard's revenue card reads
`MZN 0,00` for every provider on the platform, because revenue is summed over `COMPLETED` and
nothing in the codebase writes that status.

This spec closes the loop: the provider says the work is done, the customer has a window to
answer, and the booking reaches a terminal state either way.

It also decides what the platform is allowed to assert on its own, which is the part worth
arguing about. A platform that marks work done because a timer ran out is claiming to know
something it does not know. The design below has the platform ask first, and act only on
silence.

## What exists, and what does not

**The statuses already carry the intended design in their own comments** (`shared/infrastructure/database/booking/enums.ts`):

- `MARKED_DONE` — "The provider says the work is done; the customer's dispute window is open."
- `COMPLETED` — "The window closed without a dispute. Money moves to the provider's wallet."
- `DISPUTED` — "The customer disputed inside the window. An administrator decides."

`BookingProps` already carries `markedDoneAt`, `completedAt` and `disputedAt`, and the columns
exist on the table. What is missing is every transition that would set them: the aggregate has
exactly six (`submit`, `accept`, `decline`, `markPaid`, `expire`, `cancel`), and none of them
closes a booking.

**The sweep is a single clock.** `findDueForSweep` selects rows whose `status` is in
`DEADLINE_BEARING_STATUSES` (`DRAFT`, `AWAITING_PROVIDER`, `PENDING_PAYMENT`) and whose
`expires_at` has passed, ordered by `expires_at`, limit 200, once a minute. `booking_sweep_idx`
is a partial index whose predicate is generated from that same constant, and
`booking-constraints.test.ts` reads the predicate back out of `pg_indexes` and compares it — so
the constant and the live database cannot drift silently.

**Disputes are already built, under another name.** The support inbox shipped two days ago with
exactly the machinery a dispute needs: `support_request` is a row on a `thread`, it carries an
optional `booking_id` validated against the requester's ownership, its messages distinguish
`customer | provider | platform`, attachments hang off messages with an upload route, a storage
adapter and a download route whose access control already grants administrators a scoped bypass
on support threads, and there is an admin queue that lists, filters, replies and resolves.

**Reviews have a backend and no face.** `SubmitReviewCommand`, the `submitReview` mutation and
`BookingReviewEligibilityAdapter` all exist; the adapter allows a review when the customer has a
booking with this provider at `COMPLETED`, most recent first. Nothing in the web app calls the
mutation. There is no review form anywhere.

**The customer has no booking screens.** `/bookings` under the customer layout renders a static
"no bookings yet" card. `bookingMine` has existed on the wire since the booking core landed and
the application has never called it once; the checkout's success panel deliberately links to
`/services` instead, with a comment saying why.

## Decisions taken, and why

### The provider closes the booking; the platform closes it only after asking and being ignored

The provider gets a button on the booking page, enabled once the appointment's end time has
passed. That is the whole of the happy path.

For the provider who forgets, the platform does not simply assume. At the end of the
appointment it asks: a notification and an email saying "tell us how this went". The provider
has two answers — "concluído", which starts the customer's window, and "ainda a decorrer",
which pushes the question out another seven days and can be repeated. Only if no answer ever
comes does the platform mark the booking done itself, seven days after asking.

The alternative considered and rejected was a plain fuse: seven days after the appointment
ends, mark it done. It fails a case the owner named immediately — a job whose real work
overruns its booked slot, which is normal for the launch market's trades. Under a plain fuse
the platform would assert that a half-built wall was finished, and the customer would have to
dispute to correct it. Asking first costs one notification and one action, and removes the
platform's need to know something it cannot know.

### The window is three days; the fuse is seven

Three days is long enough for a customer who reads mail on Sunday, and short enough that a
provider who did good work is paid the same week. Seven days before the platform acts alone is
long enough that a real job has visibly ended.

Worst case, a booking both parties ignore closes ten days after the appointment. Both numbers
are constants in one file.

### Both clocks ride `expires_at` and the existing sweep

`CONFIRMED` and `MARKED_DONE` join `DEADLINE_BEARING_STATUSES`, and `expires_at` carries
whichever deadline is next:

| On | `expires_at` becomes | The sweep then |
|---|---|---|
| `markPaid` (→ `CONFIRMED`) | the appointment's `ends_at` | asks the provider to close it |
| that first sweep | now + 7 days, `reminded_at` stamped | marks it done on the provider's behalf |
| "ainda a decorrer" | now + 7 days | asks again |
| `markDone` (→ `MARKED_DONE`) | now + 3 days | completes it |

Two firings on one status are told apart by `reminded_at`, a new nullable column, rather than
by comparing timestamps — an explicit flag beats an inference that reads correctly and means
something else.

`booking_sweep_idx`'s predicate is generated from that same constant through `statusList`, so
widening the constant widens the index by itself — the hand-written predicate the schema warns
about belongs to the slot exclusion constraint, which this change does not touch. The catalogue
test reads the live predicate back and compares it to the constant in both directions, so it
fails until the generated migration is applied, which is the point.

Checked and unaffected: `SLOT_HOLDING_STATUSES` already contains `MARKED_DONE` and does not
contain `COMPLETED` or `DISPUTED`, so no booking starts or stops holding a slot and the
exclusion constraint needs no migration.

One consequence to plan for rather than discover: every booking already sitting at `CONFIRMED`
carries a stale `expires_at` — the payment deadline `accept` wrote, long past. The moment
`CONFIRMED` becomes deadline-bearing they all become due at once. That is the right outcome,
since those are precisely the bookings this phase exists to unstick, but it should be
deliberate: the migration sets `expires_at = ends_at` for existing confirmed rows, and the
sweep's `LIMIT 200` a minute drains the backlog rather than sending every provider on the
platform their whole history in one burst.

### The review is the validation

Inside the window, a customer who leaves a review completes the booking then and there. Review
eligibility opens at `MARKED_DONE` as well as `COMPLETED`, and publishing a review calls into
the booking context through an outbound port, filled at the composition root — the same shape
the booking context already uses to raise notifications, and for the same reason: no bounded
context imports another's `app/` tree.

This is why the window is a window and not a wait. A happy customer's review is the most
truthful signal the platform can get that work happened, and it should not be made to sit
behind a timer that exists for silence.

A booking at `DISPUTED` is not reviewable. The dispute is the review, until an administrator
says otherwise.

`BookingReviewEligibilityAdapter` needs one more change than its `WHERE`: it orders by
`completed_at desc` to pick which booking a review is about, and a marked-done booking has no
`completed_at`. It orders by `coalesce(completed_at, marked_done_at)` instead, so the review
still attaches to the job the customer most recently had done.

### A dispute is a support request about a booking

The customer's dispute opens a `support_request` carrying the booking's id, with a message and
attachments, on a thread the provider and the platform can both write to. It moves the booking
to `DISPUTED` and stops the clock.

`support_request` gains a `kind` column (`support | dispute`), because resolving a dispute has
to move a booking and resolving a support request must not. Inferring the difference from
"has a booking id and the booking is marked done" would work today and break the first time
somebody opens an ordinary support request about a booking they are also disputing.

Everything else is reuse: the thread, the messages, the attachments and their access control,
the admin queue, the reply box, the resolve action, the notification to every administrator.

### Resolving a dispute has two outcomes and moves no money

The administrator either keeps the completion — the booking goes to `COMPLETED` — or sides with
the customer, and the booking goes to `CANCELLED` with a new reason, `dispute_upheld`.

No refunds, no wallet entries, no partial outcomes. Money does not move anywhere in this phase
because nothing writes to the wallet yet; when that lands, `dispute_upheld` is the flag it reads
to decide what not to pay out.

### The administrator can close a booking, and has somewhere to do it from

An administrator can mark a booking done and can complete one that is waiting out its window,
using the same commands behind a different guard.

That action needs a page. The admin zone has lists for users, providers, categories, reviews,
contact requests and support, and none for bookings. This spec adds one, and deliberately not a
full bookings browser: a queue of bookings that need attention, which is the appointments that
ended and were never closed, the ones inside their window, and the disputed ones.

### Administrators are told about the ones that got stuck, not about every ending

When the platform marks a booking done because the provider never answered, every administrator
is notified — the same `findAdminUserIds` loop the support context already uses.

They are deliberately not notified when an appointment merely ends. That would be one message
per booking per day across the platform, and the support work has already recorded a follow-up
about raising a notification per administrator being expensive. The queue is where the ordinary
state lives; the notification is for the case where the platform had to act alone.

### The customer's two actions are specified here and built elsewhere

Reviewing and disputing need a booking page for the customer, and the customer has none — the
list is a placeholder and `bookingMine` has never been called. Building it here would duplicate
`feat/customer-bookings`, which is doing exactly that work right now.

So this spec writes the contract — the mutations, their inputs, their errors, and what each
does to the booking — and stops there. Nothing in this phase depends on those screens existing:
the loop closes on the three-day timer whether or not the customer ever sees a button.

## The state machine

| From | Action | To | Who | Stamps |
|---|---|---|---|---|
| `CONFIRMED` | `markDone` | `MARKED_DONE` | provider, admin, or the sweep | `marked_done_at`, `expires_at` = +3d |
| `CONFIRMED` | `stillOngoing` | `CONFIRMED` | provider | `expires_at` = +7d |
| `MARKED_DONE` | `complete` | `COMPLETED` | the sweep, a review, or an admin | `completed_at` |
| `MARKED_DONE` | `dispute` | `DISPUTED` | customer | `disputed_at` |
| `DISPUTED` | `resolveDispute(upheld: false)` | `COMPLETED` | admin | `completed_at` |
| `DISPUTED` | `resolveDispute(upheld: true)` | `CANCELLED` | admin | `cancelled_at`, reason `dispute_upheld` |

Every transition refuses a wrong source status with `BookingTransitionError`, as the six existing
ones do, and every one appends a `booking_change` row so the provider's timeline reads as a
history rather than a status.

New timeline reasons: `marked_done_by_provider`, `marked_done_by_platform`, `marked_done_by_admin`,
`still_ongoing`, `completed_by_timer`, `completed_by_review`, `completed_by_admin`,
`disputed_by_customer`, `dispute_upheld`, `dispute_rejected`. Two new pending hops for the
provider's timeline: `close_by` and `feedback_by`.

## The data model

No new tables.

- `booking` gains `reminded_at timestamptz null`.
- `BookingCancelledReason` gains `dispute_upheld`.
- `DEADLINE_BEARING_STATUSES` gains `CONFIRMED` and `MARKED_DONE`, with the hand-written
  migration for `booking_sweep_idx`.
- `support_request` gains `kind varchar(16)` with a check constraint, defaulting to `support`.
- `NotificationType` gains `ProviderBookingCloseReminder`, `BookingMarkedDone`,
  `ProviderBookingAutoClosed`, `AdminBookingAutoClosed`, `BookingDisputed`,
  `BookingDisputeResolved`. `BookingCompleted` and `ReviewRequest` already exist and are used
  rather than re-invented.

Emails, following the registry's rule that a type without a template is an in-app row and not an
error: the close reminder to the provider, the marked-done notice to the customer (it starts a
clock they need to know about), and the dispute-resolved notice to both. The rest are in-app.

## The GraphQL surface

| Field | Input | Who |
|---|---|---|
| `bookingMarkDone` | `{ bookingId }` | a member of the workspace |
| `bookingStillOngoing` | `{ bookingId }` | a member of the workspace |
| `bookingDispute` | `{ bookingId, message, attachments? }` | the booking's customer |
| `bookingAdminMarkDone` | `{ bookingId }` | administrator |
| `bookingAdminComplete` | `{ bookingId }` | administrator |
| `bookingResolveDispute` | `{ bookingId, upheld, note? }` | administrator |
| `bookingNeedsAttentionForAdmin` | `{ tab, limit?, offset? }` | administrator |

`bookingDispute` is the contract the customer branch implements against; it is built and tested
in this phase, with no screen calling it.

## Business rules

- **BR-C1** A booking may only be marked done after its appointment has ended. The provider's
  button is disabled before that, and the command refuses it.
- **BR-C2** The platform marks a booking done on its own only when the provider was asked and
  never answered. One "ainda a decorrer" resets that, however many times it is used; each one is
  a change row, so a provider stalling indefinitely is visible in the admin queue.
- **BR-C3** A review published while the booking is `MARKED_DONE` completes it. A review is
  refused while the booking is `DISPUTED`.
- **BR-C4** A dispute may only be opened by the booking's own customer, only while
  `MARKED_DONE`, and it stops every clock on that booking.
- **BR-C5** Resolving a dispute is the only way out of `DISPUTED`, and only an administrator can
  do it.
- **BR-C6** A notification that fails to raise never fails the write, and is logged with the
  booking id. The rule phase 1 set, unchanged.
- **BR-C7** Money moves nowhere in this phase. `dispute_upheld` is recorded so the wallet work
  can read it later.

## Explicitly out of scope

- **The customer's screens.** Specified above, built in `feat/customer-bookings`.
- **Refunds and wallet entries.** The next phase.
- **Reschedule and cancel by the provider.** The state machine draws both; neither has a command,
  and cancelling a paid booking is a refund question.
- **Evidence rules for disputes** — file limits, retention, who may see what beyond the access
  control attachments already enforce.
- **Reminders before the appointment.** `BookingReminder24h` exists in the enum with no producer;
  it is a different clock and a different spec.

## Open questions this spec does not settle

1. **Whether a stalling provider is ever cut off.** "Ainda a decorrer" is unlimited by design.
   If a provider uses it forever, the booking never closes and the customer never gets a window.
   The admin queue makes it visible; nothing makes it stop. A cap, or an escalation after the
   third push, is a decision for when there is evidence of the behaviour.
2. **Whether disputes should be answerable by the provider before an administrator reads them.**
   The thread supports it. Whether the provider is invited to reply, or the administrator
   arbitrates on the customer's account alone, is a policy question this spec leaves at "the
   thread exists".

## Testing

- **Aggregate:** each new transition from each wrong source status; the ended-appointment guard;
  that `stillOngoing` moves nothing but the clock.
- **Commands:** the authorisation of each; a review completing a booking through the port; a
  dispute stopping the clock; both resolution outcomes.
- **Sweep:** a confirmed booking whose appointment ended gets asked once and not twice; one that
  was asked and ignored is marked done; one that was pushed is asked again later; a marked-done
  booking completes when its window closes and does not while it is open.
- **Web, provider:** the button appears only after the appointment and only on a confirmed
  booking; both answers; the new timeline entries.
- **Web, admin:** the queue's three tabs; each action; resolving a dispute both ways.
- **Locale parity** across the eight files.

## Phasing

One plan. The backend, the provider's two actions, the admin queue and its actions, and the
dispute contract ship together — the loop does not close without all four, and the loop closing
is the point.
