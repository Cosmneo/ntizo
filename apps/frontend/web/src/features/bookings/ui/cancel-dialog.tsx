import { useTranslation } from "react-i18next";
import type { BookingDTO } from "@ntizo/shared/read-models";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@ntizo/frontend-ui";
import { momentWording } from "@/features/checkout/domain/slot-wording";
import { useCancelBooking } from "../viewmodel/use-my-bookings";

/**
 * The mockup's whole point (screen 7): say what happens, not "tem a
 * certeza?". The slot named, the provider named, and the reason there is
 * nothing to refund stated rather than implied — a customer who has not paid
 * has no payment to undo, and a generic confirmation would leave that
 * unsaid.
 *
 * Owns its own mutation rather than taking `open`/`busy` from the caller
 * (contrast `provider/bookings/ui/decline-dialog.tsx`, which is purely
 * presentational): the caller's only job is deciding *which* booking is
 * being cancelled, by mounting this component or not — there is no
 * meaningful "closed but rendered" state for a dialog with one action and no
 * form. `open` is passed as the literal `true` for that reason; the only way
 * to make this dialog disappear is `onClose`.
 */
export function CancelDialog({
  booking,
  onClose,
}: {
  booking: Pick<BookingDTO, "id" | "providerName" | "startsAt" | "timezone">;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation("bookings");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const cancel = useCancelBooking();
  const when = momentWording(booking.startsAt, locale, booking.timezone);
  /**
   * `BOOKING_TRANSITION` means the booking already left the state this
   * dialog was drawn for — the provider answered, or the payment landed,
   * while it sat open — so a retry would refuse identically forever, and
   * "tente novamente" would be a lie. Every other code (`NOT_BOOKING_CUSTOMER`,
   * a dropped connection) gets the generic refusal, which likewise promises
   * no retry, because none of them are ones this dialog can tell apart from
   * "try again and it might work" — see `provider/bookings/ui/booking-page.tsx`'s
   * own `onError` for the precedent this follows.
   */
  const moved =
    (cancel.error as { code?: string } | null)?.code === "BOOKING_TRANSITION";

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("cancelDialogTitle")}</DialogTitle>
          <DialogDescription>
            {t("cancelDialogBody", {
              date: when.date,
              time: when.time,
              provider: booking.providerName,
            })}
          </DialogDescription>
        </DialogHeader>
        {/* Stays open on a refusal — never closes as if it had succeeded —
            and the cache still drops (`useCancelBooking` invalidates on
            every settlement, not only success): a `BOOKING_TRANSITION`
            means the row behind this dialog is already wrong, and leaving
            it cached would survive the dialog closing as a dead Cancelar
            button over a booking that can no longer be cancelled. */}
        {cancel.isError && (
          <p role="alert" className="type-caption -mt-2 mb-2 text-[var(--color-destructive)]">
            {t(moved ? "cancelDialogMoved" : "cancelDialogError")}
          </p>
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={cancel.isPending}
          >
            {t("keepBooking")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={cancel.isPending}
            onClick={() => cancel.mutate(booking.id, { onSuccess: onClose })}
          >
            {t("cancelBooking")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
