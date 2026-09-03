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
type OverReason = "windowClosed" | "attemptsSpent" | "generic";

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
 * else that means retrying would refuse identically: the payment window
 * closing (caught either by the poll noticing `deadlineOf` is behind us, or
 * by the mutation's own `BOOKING_PAYMENT_WINDOW_CLOSED`) and the three
 * charge attempts being spent (`BOOKING_CHARGE_ATTEMPTS_SPENT`) each get
 * their own sentence; anything else this dialog was not built to explain
 * (a stranger's id, a dropped connection) gets a generic one — still no
 * spinner, still not disguised as a retry that would work.
 *
 * The window-closed check runs before the very first automatic attempt too:
 * a dialog opened against a row whose `expiresAt` had already passed (the
 * countdown the list showed when it was last read is now behind us) has no
 * reason to spend a request finding that out from the server when the prop
 * it was handed already says so.
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
  const windowClosed =
    liveStatus === "PENDING_PAYMENT"
      ? deadline !== null && new Date(deadline).getTime() <= now.getTime()
      : liveStatus !== "CONFIRMED";

  useEffect(() => {
    if (liveStatus === "CONFIRMED") onClose();
  }, [liveStatus, onClose]);

  // The very first attempt, once, on mount — gated on the window's state at
  // that instant (see this component's own doc comment): a booking already
  // past its deadline when the dialog opened gets no wasted request.
  const attempted = useRef(false);
  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;
    if (windowClosed) return;
    pay.mutate(booking.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const payErrorCode = (pay.error as { code?: string } | null)?.code ?? null;

  let phase: Phase;
  let overReason: OverReason | null = null;
  if (windowClosed || payErrorCode === "BOOKING_PAYMENT_WINDOW_CLOSED") {
    phase = "over";
    overReason = "windowClosed";
  } else if (payErrorCode === "BOOKING_CHARGE_ATTEMPTS_SPENT") {
    phase = "over";
    overReason = "attemptsSpent";
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
                {t(
                  overReason === "windowClosed"
                    ? "payDialogWindowClosed"
                    : overReason === "attemptsSpent"
                      ? "payDialogAttemptsSpent"
                      : "payDialogError",
                )}
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
