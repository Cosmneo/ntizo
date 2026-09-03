import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  BOOKING_DECLINE_REASONS,
  type BookingDeclineReason,
} from "@ntizo/shared/read-models";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@ntizo/frontend-ui";

/**
 * A decline is the one action on this page the customer feels, so it gets a
 * question and a reason. Four tokens, translated here and in the customer's
 * inbox; "other" says nothing more than the default and exists so nobody is
 * made to pick a reason that is not theirs.
 */
export function DeclineDialog({
  open,
  onOpenChange,
  onConfirm,
  busy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: BookingDeclineReason) => void;
  busy: boolean;
}) {
  const { t } = useTranslation("provider");
  const [reason, setReason] = useState<BookingDeclineReason>("not_available");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("bookings.declineTitle")}</DialogTitle>
          <DialogDescription>{t("bookings.declineBody")}</DialogDescription>
        </DialogHeader>
        <fieldset className="grid gap-2 border-0 p-0">
          <legend className="sr-only">{t("bookings.declineTitle")}</legend>
          {BOOKING_DECLINE_REASONS.map((key) => (
            <label
              key={key}
              className="flex cursor-pointer items-center gap-3 rounded-[var(--radius-card-sm)] border border-[var(--color-border)] p-3"
            >
              <input
                type="radio"
                name="decline-reason"
                value={key}
                checked={reason === key}
                onChange={() => setReason(key)}
                className="h-4 w-4 accent-[var(--color-primary)]"
              />
              <span className="type-body">{t(`bookings.declineReason.${key}`)}</span>
            </label>
          ))}
        </fieldset>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            {t("bookings.cancel")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => onConfirm(reason)}
            disabled={busy}
          >
            {t("bookings.declineConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
