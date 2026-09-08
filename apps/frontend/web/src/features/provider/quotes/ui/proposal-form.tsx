import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { hasContact } from "@ntizo/shared/text";
import { Button } from "@ntizo/frontend-ui";
import { formatMoney } from "@/features/wallet/domain/money";
import { formatCommission } from "@/shared/domain/commission-format";
import { commissionMinorOf, payoutMinorOf } from "@/features/quotes/domain/money-split";
import { useAttachments, type PendingAttachment } from "@/features/messaging/viewmodel/use-attachments";
import { QuoteAttachmentPicker } from "@/features/quotes/ui/attachment-picker";
import type { ProposeQuoteInput } from "../viewmodel/use-provider-quotes";

const FORM_LABEL = "text-sm font-medium";
const TEXT_FIELD =
  "w-full rounded-[var(--radius-field)] border border-[var(--color-border)] bg-[var(--color-background)] px-3.5 py-2.5 text-sm";

export interface ProposalFormPerformer {
  id: string;
  firstName: string;
}

/**
 * What "Rever proposta" opens the form pre-filled with — the live proposal's
 * own values, in the same shapes the fields themselves edit (a typed price
 * string, not minor units; a date and a time, not an instant).
 *
 * Left unset for a first proposal, which has nothing yet to revise from —
 * the fields default to their ordinary blank state, exactly as before this
 * prop existed.
 */
export interface ProposalFormInitialValues {
  price: string;
  date: string;
  time: string;
  durationHours: string;
  memberId: string;
  note: string;
}

/**
 * The files controller a caller can share, the same shape and the same
 * reason `CloseQuoteDialog` accepts one: the page's own `send` (see
 * `quote-page.tsx`) calls `uploadAll()` on the exact instance this form's
 * picker is adding to, so the files it uploads are the files the provider
 * actually attached — not a second, always-empty list.
 */
interface AttachmentsController {
  files: readonly PendingAttachment[];
  add: (file: File) => void;
  remove: (id: string) => void;
}

/**
 * A number typed the way this market writes one — a comma for the decimal
 * point as often as a dot — parsed the same tolerant way
 * `service-draft.ts#parseAmountMinor` already does for a provider's own
 * price fields. Anything else (letters, a second separator, more than two
 * decimal places) is refused rather than guessed at; `null` is "not a
 * number", the same way an empty field is one.
 */
function parseDecimal(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Number(normalized);
}

/**
 * The provider types the customer's price and reads their own.
 *
 * "Recebe" is the largest number in the form on purpose: it is the one the
 * provider is deciding on. The arithmetic is `commissionMinorOf`/
 * `payoutMinorOf` — the booking aggregate's expression character for
 * character — showing one number here and paying another is the failure
 * this whole block exists to avoid.
 */
function toMinor(price: string): number | null {
  const amount = parseDecimal(price);
  return amount === null ? null : Math.round(amount * 100);
}

/**
 * The duration, in minutes, from a field written in hours.
 *
 * "A number of hours" is the common case — a job takes "2", not "120
 * minutes" — and the fallback the field's own doc references is that the
 * same box accepts a fraction of an hour ("1,5") for the job that does not
 * round to a whole one, converted to the minute the mutation actually wants.
 */
function toDurationMinutes(hours: string): number | null {
  const amount = parseDecimal(hours);
  return amount === null ? null : Math.round(amount * 60);
}

/**
 * The date and time as an instant, read in the provider's own zone.
 *
 * `new Date("2026-09-20T08:30")` reads that string in the *browser's* zone,
 * so a provider whose laptop is clocked to Lisbon would propose an hour
 * earlier than they meant. This computes the offset the target zone actually
 * keeps at that date instead, by the two-pass `Date.UTC` trick: read the
 * typed wall-clock numbers as if they were UTC, ask what a clock in
 * `timeZone` would show at that instant, and the gap between the two *is*
 * the zone's own offset — positive for a zone ahead of UTC, so it is
 * subtracted, not added, to walk back from the guess to the real instant.
 * Works the same in a zone with daylight saving as in one that never
 * changes, because the offset is read off the date in question rather than
 * assumed.
 */
function toInstant(date: string, time: string, timeZone: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const guessUTC = Date.UTC(year!, month! - 1, day!, hour!, minute!, 0, 0);

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(guessUTC));
  const read = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const asIfLocal = Date.UTC(
    Number(read.year),
    Number(read.month) - 1,
    Number(read.day),
    Number(read.hour),
    Number(read.minute),
    Number(read.second),
  );
  const offset = asIfLocal - guessUTC;
  return new Date(guessUTC - offset).toISOString();
}

/**
 * Plate 7/7b's right-hand column: everything the mutation needs, and nothing
 * it does not — a controlled form that owns no mutation of its own. It hands
 * a `ProposeQuoteInput` minus the quote id up to the page, which is what
 * carries `quoteId`, runs the write, and reacts to what comes back.
 *
 * **`initialValues` is what makes a revision safe to send.** "Pode revê-la
 * enquanto o cliente não decidir" (the mockup's own promise) is not "type it
 * all again from memory" — a provider adjusting a price by 200 MZN on a job
 * they already specified needs the existing date, time, duration, member and
 * note in front of them to check against, not a blank form. Left unset for a
 * first proposal, which has nothing to revise from.
 *
 * `attachments` is optional and, left unset, this form runs its own
 * `useAttachments()` — the same fallback `CloseQuoteDialog` makes, always
 * called so the rules of hooks are never broken by a caller that happens to
 * share one.
 */
export function ProposalForm({
  commissionBps,
  currency,
  performers,
  timezone,
  onSubmit,
  busy,
  notice,
  isRevision = false,
  initialValues,
  attachments: attachmentsProp,
}: {
  commissionBps: number;
  currency: string;
  performers: readonly ProposalFormPerformer[];
  timezone: string;
  onSubmit: (values: Omit<ProposeQuoteInput, "quoteId" | "attachments">) => void;
  busy: boolean;
  /** An i18next key for a refusal the *page* learned about — a lost race, a server-side refusal. */
  notice?: string;
  /** Swaps "Enviar proposta"/"A sua proposta" for their revision wording, when a live proposal already exists. */
  isRevision?: boolean;
  /**
   * The live proposal's own values, when this mount of the form is a
   * revision rather than a first price. Read once, at mount — this
   * component remounts fresh every time the page swaps the read-only
   * proposal back for the form (they are different element types in the
   * same conditional), so there is no stale-prop case to guard against.
   */
  initialValues?: ProposalFormInitialValues;
  attachments?: AttachmentsController;
}) {
  const { t, i18n } = useTranslation("quotes");
  const locale = i18n.resolvedLanguage ?? i18n.language;

  const [price, setPrice] = useState(initialValues?.price ?? "");
  const [date, setDate] = useState(initialValues?.date ?? "");
  const [time, setTime] = useState(initialValues?.time ?? "");
  const [durationHours, setDurationHours] = useState(initialValues?.durationHours ?? "");
  // The only member preselects itself — asking a provider with one employee
  // to choose them from a list of one is a click that decides nothing.
  const [memberId, setMemberId] = useState(
    initialValues?.memberId ?? (performers.length === 1 ? performers[0]!.id : ""),
  );
  const [note, setNote] = useState(initialValues?.note ?? "");
  const [error, setError] = useState<string | null>(null);

  const own = useAttachments();
  const attachments = attachmentsProp ?? own;

  const priceMinor = toMinor(price);
  const commission = priceMinor !== null ? commissionMinorOf(priceMinor, commissionBps) : null;
  const payout = priceMinor !== null ? payoutMinorOf(priceMinor, commissionBps) : null;

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (priceMinor === null || priceMinor <= 0) {
      setError("propose.errorPriceRequired");
      return;
    }
    if (date === "" || time === "") {
      setError("propose.errorDateRequired");
      return;
    }
    const durationMinutes = toDurationMinutes(durationHours);
    if (durationMinutes === null || durationMinutes < 1 || durationMinutes > 24 * 60) {
      setError("propose.errorDurationInvalid");
      return;
    }
    if (memberId === "") {
      setError("propose.errorMemberRequired");
      return;
    }
    const trimmedNote = note.trim();
    if (hasContact(trimmedNote)) {
      setError("propose.errorContact");
      return;
    }

    onSubmit({
      priceMinor,
      startsAt: toInstant(date, time, timezone),
      durationMinutes,
      providerMemberId: memberId,
      ...(trimmedNote ? { note: trimmedNote } : {}),
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-5">
      <h2 className="type-h3">{t(isRevision ? "propose.titleRevise" : "propose.title")}</h2>

      <div className="grid gap-1.5">
        <label htmlFor="proposal-price" className={FORM_LABEL}>
          {t("propose.priceLabel")}
        </label>
        <div className="flex items-center gap-2">
          <input
            id="proposal-price"
            inputMode="decimal"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            disabled={busy}
            className={TEXT_FIELD}
          />
          <span className="type-caption text-[var(--color-muted-foreground)]">{currency}</span>
        </div>
      </div>

      {/* The split appears the moment a price parses — before the date, the
          duration or the member are filled in — because it answers the one
          question a price by itself already raises: what does this actually
          pay. "Recebe" is the largest, boldest number here on purpose; see
          this file's own note on `commissionMinorOf`/`payoutMinorOf`. */}
      {priceMinor !== null && commission !== null && payout !== null && (
        <dl className="grid gap-2 rounded-[var(--radius-card-sm)] bg-[var(--color-muted)] p-4">
          <div className="flex justify-between">
            <dt className="type-body">{t("propose.customerPays")}</dt>
            <dd className="type-body tabular-nums">{formatMoney(priceMinor, currency, locale)}</dd>
          </div>
          <div className="flex justify-between text-[var(--color-muted-foreground)]">
            <dt className="type-body">
              {t("propose.commission", { rate: formatCommission(commissionBps, locale) })}
            </dt>
            <dd className="type-body tabular-nums">
              {"− "}
              {formatMoney(commission, currency, locale)}
            </dd>
          </div>
          <div className="flex justify-between border-t border-[var(--color-border)] pt-2">
            <dt className="type-body-medium font-semibold">{t("propose.receives")}</dt>
            <dd className="type-h3 font-semibold tabular-nums">
              {formatMoney(payout, currency, locale)}
            </dd>
          </div>
        </dl>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <label htmlFor="proposal-date" className={FORM_LABEL}>
            {t("propose.dateLabel")}
          </label>
          <input
            id="proposal-date"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            disabled={busy}
            className={TEXT_FIELD}
          />
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="proposal-time" className={FORM_LABEL}>
            {t("propose.timeLabel")}
          </label>
          <input
            id="proposal-time"
            type="time"
            value={time}
            onChange={(event) => setTime(event.target.value)}
            disabled={busy}
            className={TEXT_FIELD}
          />
        </div>
      </div>

      <div className="grid gap-1.5 sm:w-48">
        <label htmlFor="proposal-duration" className={FORM_LABEL}>
          {t("propose.durationLabel")}
        </label>
        <div className="flex items-center gap-2">
          <input
            id="proposal-duration"
            inputMode="decimal"
            value={durationHours}
            onChange={(event) => setDurationHours(event.target.value)}
            disabled={busy}
            className={TEXT_FIELD}
          />
          <span className="type-caption text-[var(--color-muted-foreground)]">
            {t("propose.durationUnit")}
          </span>
        </div>
      </div>

      <div className="grid gap-1.5">
        <label htmlFor="proposal-member" className={FORM_LABEL}>
          {t("propose.memberLabel")}
        </label>
        {/*
          A native `<select>`, not this app's usual `Select` — a plain,
          labelable form control is what lets a provider's assistive
          technology (and this file's own tests) read the choice off the
          label the ordinary way. Disabled rather than hidden when there is
          only one option: the provider still sees who is booked, and there
          is nothing left to choose.
        */}
        <select
          id="proposal-member"
          value={memberId}
          onChange={(event) => setMemberId(event.target.value)}
          disabled={busy || performers.length <= 1}
          className={TEXT_FIELD}
        >
          {performers.length !== 1 && <option value="" />}
          {performers.map((performer) => (
            <option key={performer.id} value={performer.id}>
              {performer.firstName}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-1.5">
        <label htmlFor="proposal-note" className={FORM_LABEL}>
          {t("propose.noteLabel")}{" "}
          <span className="font-normal text-[var(--color-muted-foreground)]">
            ({t("propose.optional")})
          </span>
        </label>
        <textarea
          id="proposal-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={t("propose.notePlaceholder")}
          rows={3}
          disabled={busy}
          className={TEXT_FIELD}
        />
      </div>

      <div className="grid gap-2">
        <p className={FORM_LABEL}>{t("propose.attachmentsLabel")}</p>
        <QuoteAttachmentPicker
          inputId="proposal-files"
          label={t("propose.attachmentsAction")}
          hint={`${t("propose.attachmentsLimit")} · ${t("propose.attachmentsHint")}`}
          files={attachments.files}
          onAdd={attachments.add}
          onRemove={attachments.remove}
          disabled={busy}
        />
      </div>

      {(error ?? notice) && (
        <p role="alert" className="type-caption text-[var(--color-destructive)]">
          {t(error ?? notice!)}
        </p>
      )}

      <div>
        <Button type="submit" disabled={busy}>
          {t(isRevision ? "propose.submitRevise" : "propose.submit")}
        </Button>
      </div>
    </form>
  );
}
