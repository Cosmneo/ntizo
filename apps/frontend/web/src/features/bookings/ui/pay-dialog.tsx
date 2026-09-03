import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { isValidPhoneNumber, parsePhoneNumberFromString } from "libphonenumber-js";
import { Loader2 } from "lucide-react";
import type { BookingDTO } from "@ntizo/shared/read-models";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  PhoneInput,
} from "@ntizo/frontend-ui";
import { formatHeadlinePrice } from "@/features/directory/services/domain/service-card";
import { useUpdateMyProfile } from "@/features/account/viewmodel/use-update-profile";
import { deadlineOf } from "../domain/status";
import { usePayBooking, usePayBookingPoll } from "../viewmodel/use-my-bookings";

/**
 * "+258849994567" → "+258 84 ••• 45 67" — the country code, the first two
 * digits of the national number and the last four, the mockup's own shape
 * for screen 6's "Confirme no seu telemóvel". Enough for the customer to
 * recognise their own handset without printing a number in full on a page
 * anyone glancing at their screen can read.
 *
 * Falls back to the raw value for anything `libphonenumber-js` cannot parse
 * or that is too short to mask meaningfully — a defensive floor, never
 * expected to fire against a number the backend just accepted a charge
 * request for.
 */
function maskMpesaNumber(e164: string): string {
  const parsed = parsePhoneNumberFromString(e164);
  const national = parsed?.nationalNumber ?? e164.replace(/^\+\d+/, "");
  if (!parsed || national.length < 6) return e164;
  const first = national.slice(0, 2);
  const last = national.slice(-4);
  return `+${parsed.countryCallingCode} ${first} ••• ${last.slice(0, 2)} ${last.slice(2)}`;
}

type Phase = "waiting" | "needsPhone" | "over";
/**
 * Six endings, six sentences — one per fact this dialog can actually point
 * to, and never a sentence that claims a cause nothing here observed:
 *
 * - `windowClosed` — the payment window ran out, either because the poll
 *   read `EXPIRED` or because `deadlineOf` is already behind us, or because
 *   the mutation itself refused with `BOOKING_PAYMENT_WINDOW_CLOSED`. All
 *   three are the same fact seen at different moments.
 * - `cancelled` — the poll read `CANCELLED`. A cancellation is not a
 *   window running out, and saying so would blame the clock for something
 *   a person (or the sweep, for a different reason) did.
 * - `attemptsSpent` — `BOOKING_CHARGE_ATTEMPTS_SPENT`: the three tries are
 *   gone.
 * - `moved` — `BOOKING_INVALID_TRANSITION`: the booking left
 *   `PENDING_PAYMENT` between this dialog opening and the mutation
 *   landing, for a reason this dialog cannot ask after the fact. No retry
 *   would land differently — the same reasoning `CancelDialog`'s own
 *   `cancelDialogMoved` was built for.
 * - `cannotComplete` — `NOT_BOOKING_CUSTOMER`, or the poll landing on a
 *   status this dialog never opens against in the first place
 *   (`AWAITING_PROVIDER`, `DRAFT`, …). Both are refusals with no honest
 *   sentence to name past "this cannot go through right now" — inventing
 *   one would be guessing a cause from its absence.
 * - `generic` — anything else the mutation threw (no code at all, most
 *   likely a dropped connection): the one ending where "try again in a
 *   moment" is actually true.
 */
type OverReason =
  | "windowClosed"
  | "cancelled"
  | "attemptsSpent"
  | "moved"
  | "cannotComplete"
  | "generic";

const OVER_REASON_KEY: Record<OverReason, string> = {
  windowClosed: "payDialogWindowClosed",
  cancelled: "payDialogCancelled",
  attemptsSpent: "payDialogAttemptsSpent",
  moved: "payDialogMoved",
  cannotComplete: "payDialogCannotComplete",
  generic: "payDialogError",
};

/**
 * What the live poll alone says about this booking, independent of
 * whatever the mutation is doing — `null` while there is nothing to say
 * yet (still `PENDING_PAYMENT`, deadline still ahead) or once it is
 * `CONFIRMED` (a separate effect closes the dialog for that case; this
 * function is never asked to word success).
 *
 * The one rule this function exists to enforce: read the status that
 * actually came back, never infer one from "not PENDING_PAYMENT, not
 * CONFIRMED, so the window must have closed" — that inference is exactly
 * what told a customer their payment window had run out on a booking a
 * second tab had simply cancelled.
 */
function pollOverReason(
  status: BookingDTO["status"],
  deadline: string | null,
  now: Date,
): OverReason | null {
  if (status === "EXPIRED") return "windowClosed";
  if (status === "CANCELLED") return "cancelled";
  if (status === "PENDING_PAYMENT") {
    return deadline !== null && new Date(deadline).getTime() <= now.getTime()
      ? "windowClosed"
      : null;
  }
  if (status === "CONFIRMED") return null;
  // AWAITING_PROVIDER, DRAFT, MARKED_DONE, COMPLETED, DISPUTED, DECLINED:
  // none of them should ever reach this dialog — `canPay` only ever offers
  // Pagar on a `PENDING_PAYMENT` row — but a read that disagrees this far
  // gets a sentence that admits it does not know why, not one that guesses.
  return "cannotComplete";
}

/**
 * Screen 6: the customer presses "Pagar" and this dialog takes over —
 * opening by calling the mutation itself rather than waiting for a second
 * press, the same "the caller's only job is mounting this or not" contract
 * `CancelDialog` establishes.
 *
 * **Three states, and none of them may spin forever.** *Waiting* is the
 * default: the prompt is on its way (or already sent), and a poll
 * (`usePayBookingPoll`) follows the booking until it is `CONFIRMED`, at
 * which point this closes itself — the customer may also close it by hand,
 * safely, because the prompt is already on the handset and the list behind
 * this dialog reflects the outcome whenever it is next read. *Needing a
 * number* is reached only by `BOOKING_NO_CUSTOMER_PHONE` — the one refusal
 * with a remedy the customer can act on right here. *Over* is everything
 * else, worded per `OverReason` — see that type's own comment for the full
 * list — and never guessed: the ending is read off what the poll (or the
 * mutation's own code) actually reported, not inferred from the absence of
 * `PENDING_PAYMENT`/`CONFIRMED`. That inference is exactly the bug this
 * dialog shipped with once — a booking cancelled from a second tab, or by
 * the sweep, read as "not pending, not confirmed" and was told its payment
 * window had run out, which was never true. `pollOverReason` is where that
 * reading now happens, and it is the one place allowed to say what a status
 * other than `CONFIRMED` means.
 *
 * The poll's own reading runs before the very first automatic attempt too:
 * a dialog opened against a row whose prop already reads `CANCELLED`,
 * `EXPIRED` or past its `deadlineOf` has no reason to spend a request
 * finding that out from the server when the prop it was handed already
 * says so.
 */
export function PayDialog({
  booking,
  phone,
  onClose,
}: {
  booking: Pick<BookingDTO, "id" | "status" | "expiresAt" | "priceMinor" | "currency">;
  phone: string | null;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation("bookings");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const amount = formatHeadlinePrice(booking.priceMinor, booking.currency, locale);

  const pay = usePayBooking();
  const saveProfile = useUpdateMyProfile();
  const poll = usePayBookingPoll(booking);

  const liveStatus = poll.data?.status ?? booking.status;
  const liveExpiresAt = poll.data ? poll.data.expiresAt : booking.expiresAt;
  const deadline = deadlineOf({ status: liveStatus, expiresAt: liveExpiresAt });
  // The same "no clock of our own" trick the list and detail pages use:
  // `dataUpdatedAt` stands in for "now", advancing every time the poll
  // actually lands rather than on a timer this component keeps itself.
  const now = new Date(poll.dataUpdatedAt || Date.now());
  // What the poll alone says — computed before any mutation-error reading,
  // and given priority below, because it is the freshest, most authoritative
  // fact this dialog has about the booking: a mutation error can only ever
  // report what was true the instant it was sent.
  const fromPoll = liveStatus === "CONFIRMED" ? null : pollOverReason(liveStatus, deadline, now);

  useEffect(() => {
    if (liveStatus === "CONFIRMED") onClose();
  }, [liveStatus, onClose]);

  // The very first attempt, once, on mount — gated on what the poll already
  // says at that instant (see this component's own doc comment): a booking
  // whose prop already reads `CANCELLED`, `EXPIRED` or past its deadline
  // gets no wasted request.
  const attempted = useRef(false);
  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;
    if (fromPoll) return;
    pay.mutate(booking.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const payErrorCode = (pay.error as { code?: string } | null)?.code ?? null;

  let phase: Phase;
  let overReason: OverReason | null = null;
  if (fromPoll) {
    phase = "over";
    overReason = fromPoll;
  } else if (payErrorCode === "BOOKING_PAYMENT_WINDOW_CLOSED") {
    phase = "over";
    overReason = "windowClosed";
  } else if (payErrorCode === "BOOKING_CHARGE_ATTEMPTS_SPENT") {
    phase = "over";
    overReason = "attemptsSpent";
  } else if (payErrorCode === "BOOKING_INVALID_TRANSITION") {
    phase = "over";
    overReason = "moved";
  } else if (payErrorCode === "NOT_BOOKING_CUSTOMER") {
    phase = "over";
    overReason = "cannotComplete";
  } else if (payErrorCode === "BOOKING_NO_CUSTOMER_PHONE") {
    phase = "needsPhone";
  } else if (pay.isError) {
    phase = "over";
    overReason = "generic";
  } else {
    phase = "waiting";
  }

  const [phoneValue, setPhoneValue] = useState("");
  const [phoneInvalid, setPhoneInvalid] = useState(false);

  async function handleSaveAndPay(e: FormEvent) {
    e.preventDefault();
    if (!phoneValue || !isValidPhoneNumber(phoneValue)) {
      setPhoneInvalid(true);
      return;
    }
    setPhoneInvalid(false);
    await saveProfile.mutateAsync({ phoneNumber: phoneValue });
    pay.mutate(booking.id);
  }

  const busy = pay.isPending || saveProfile.isPending;

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent>
        {phase === "waiting" && (
          <>
            <DialogHeader>
              <div className="mb-1 flex items-center gap-2">
                <Loader2
                  className="h-4 w-4 animate-spin text-[var(--color-primary)]"
                  aria-hidden="true"
                />
                <span className="type-caption font-semibold text-[var(--color-primary)]">
                  {t("payDialogWaitingCaption")}
                </span>
              </div>
              <DialogTitle>{t("payDialogWaitingTitle")}</DialogTitle>
              <DialogDescription>
                {t("payDialogWaitingBody", {
                  phone: phone ? maskMpesaNumber(phone) : "",
                  amount,
                })}
              </DialogDescription>
            </DialogHeader>
            <p className="type-caption -mt-2 mb-2 text-[var(--color-muted-foreground)]">
              {t("payDialogWaitingNote")}
            </p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                {t("payDialogClose")}
              </Button>
            </DialogFooter>
          </>
        )}

        {phase === "needsPhone" && (
          <form onSubmit={(e) => void handleSaveAndPay(e)}>
            <DialogHeader>
              <DialogTitle>{t("payDialogPhoneTitle")}</DialogTitle>
              <DialogDescription>{t("payDialogPhoneBody")}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-1.5">
              <Label htmlFor="pay-dialog-phone">{t("payDialogPhoneLabel")}</Label>
              <PhoneInput
                id="pay-dialog-phone"
                value={phoneValue}
                onChange={(next) => setPhoneValue(next)}
                defaultCountry="MZ"
                locale={i18n.language}
                searchPlaceholder={t("countrySearchPlaceholder")}
                noResultsText={t("countryNoResults")}
                countrySelectLabel={t("countrySelectLabel")}
                aria-invalid={phoneInvalid}
                aria-describedby="pay-dialog-phone-hint"
              />
              <p
                id="pay-dialog-phone-hint"
                className="type-caption text-[var(--color-muted-foreground)]"
              >
                {t("payDialogPhoneHint", { amount })}
              </p>
              {phoneInvalid && (
                <p role="alert" className="type-caption text-[var(--color-destructive)]">
                  {t("payDialogPhoneInvalid")}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
                {t("payDialogNotNow")}
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? t("payDialogSaving") : t("payDialogSaveAndPay")}
              </Button>
            </DialogFooter>
          </form>
        )}

        {phase === "over" && (
          <>
            <DialogHeader>
              <DialogTitle>{t("payDialogOverTitle")}</DialogTitle>
              <DialogDescription>
                {t(OVER_REASON_KEY[overReason ?? "generic"])}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                {t("payDialogClose")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
