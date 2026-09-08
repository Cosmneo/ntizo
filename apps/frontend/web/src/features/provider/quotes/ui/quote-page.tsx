import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { QUOTE_PROVIDER_DECLINE_REASONS, type QuoteProviderDeclineReason } from "@ntizo/shared";
import { Skeleton } from "@ntizo/frontend-ui";
import { EmptyCard } from "@/shared/components/empty-card";
import { GraphqlError } from "@/shared/lib/graphql/session-graphql";
import { formatMoney } from "@/features/wallet/domain/money";
import { momentWording, slotWording } from "@/features/checkout/domain/slot-wording";
import { useAttachments } from "@/features/messaging/viewmodel/use-attachments";
import { useActiveProvider } from "@/features/provider/viewmodel/use-active-provider";
import { canDecline, canPropose, revisionCount } from "@/features/quotes/domain/status";
import { QuoteStatusLine } from "@/features/quotes/ui/quote-status";
import { QuoteAttachmentList } from "@/features/quotes/ui/attachment-list";
import { CloseQuoteDialog } from "@/features/quotes/ui/close-dialog";
import {
  useAnswerQuote,
  useProviderQuote,
  type ProposeQuoteInput,
} from "../viewmodel/use-provider-quotes";
import { ProposalForm, type ProposalFormInitialValues } from "./proposal-form";

const CAPTION =
  "type-caption font-bold tracking-[0.14em] text-[var(--color-muted-foreground)] uppercase";
const CARD = "rounded-[var(--radius-card)] border border-[var(--color-border)] p-5";

/** The timeline's short form — "5 Set, 08:00" — the same shape `booking-page.tsx`'s own `stamp` uses. */
function shortWhen(iso: string, locale: string, timeZone: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso));
}

/** "sábado, 20 de setembro, 16:40" — one instant, for the proposal's own deadline. */
function longWhen(iso: string, locale: string, timeZone: string): string {
  const at = momentWording(iso, locale, timeZone);
  return `${at.date}, ${at.time}`;
}

/**
 * The live proposal's own duration, in the app's shared `unit.*` vocabulary
 * rather than the customer-facing `detail.durationHours`/`durationMinutes`
 * sentences — this page's copy stays inside `provider.*`/`propose.*` plus
 * the handful of cross-cutting tokens (`unit.*`, `close.reason.*`) every
 * other quote screen already treats as shared.
 */
function durationWording(minutes: number, t: TFunction<"quotes">): string {
  return minutes % 60 === 0
    ? t("unit.h", { count: minutes / 60 })
    : t("unit.min", { count: minutes });
}

/**
 * The reverse of `proposal-form.tsx`'s own `toInstant`: an instant, read back
 * as the date and time a clock in the quote's own zone would show it.
 *
 * This is what "Rever proposta" needs to put the live proposal's own
 * appointment back into the form's plain `<input type="date">`/
 * `<input type="time">` fields rather than opening blank — a provider
 * adjusting a price by 200 MZN on a job they already specified has to see
 * the existing date and time to check against, not retype them from memory.
 * Unlike `toInstant`, no offset arithmetic is needed: `Intl.DateTimeFormat`
 * already reads an instant in any zone directly, and an `<input>`'s own
 * `value` wants exactly the digits this returns.
 */
function fromInstant(iso: string, timeZone: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const read = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return { date: `${read.year}-${read.month}-${read.day}`, time: `${read.hour}:${read.minute}` };
}

/**
 * The price field's own draft string for an existing minor-unit amount — two
 * decimal places, comma-separated, the same shape
 * `service-draft.ts#optionDraftFrom` writes for a provider's price fields
 * elsewhere in this app, and one `proposal-form.tsx`'s own comma-tolerant
 * `parseDecimal` reads straight back.
 */
function priceDraft(priceMinor: number): string {
  return (priceMinor / 100).toFixed(2).replace(".", ",");
}

/**
 * The duration field's own draft string, in hours: a bare whole number when
 * the minutes divide evenly ("4"), two decimal places otherwise ("1,67") —
 * rounded rather than repeating, since a duration this page ever wrote was
 * itself rounded from a typed number of hours and a longer decimal would
 * only be re-rounded the moment it was resubmitted unchanged.
 */
function durationDraft(durationMinutes: number): string {
  const hours = Math.round((durationMinutes / 60) * 100) / 100;
  return String(hours).replace(".", ",");
}

/**
 * The server codes `quotePropose` can throw that deserve their own sentence.
 * Anything else falls back to `propose.errorGeneric`.
 */
const PROPOSE_ERROR_COPY: Record<string, string> = {
  QUOTE_PRICE_BELOW_MINIMUM: "propose.errorPriceBelowMinimum",
  QUOTE_STARTS_IN_PAST: "propose.errorStartsInPast",
  QUOTE_DURATION_INVALID: "propose.errorDurationInvalid",
  QUOTE_MEMBER_CANNOT_PERFORM: "propose.errorMemberCannotPerform",
  QUOTE_SLOT_OVERLAP: "propose.errorSlotOverlap",
  QUOTE_TRANSITION: "propose.errorMoved",
  CONTACT_DETECTED: "propose.errorContact",
};

/**
 * `/provider/$slug/quotes/$quoteId` — plates 7 and 7b: everything the
 * customer sent, at full size, on the left; the proposal form (or, once one
 * exists, the proposal itself) on the right.
 *
 * Follows `provider/bookings/ui/booking-page.tsx` for shape: the back link,
 * the four early returns (loading, error, not found, then the page), every
 * hook above that ladder, one clock read once per render.
 *
 * **The reveal rule is enforced by shape, not by a branch here.**
 * `ProviderQuoteDetailDTO` carries no street line, phone or email — see that
 * type's own doc comment — so there is nothing in scope to leak before the
 * booking this quote might become is `CONFIRMED`. The location renders as
 * bairro and city, with `provider.whereNote` under it.
 *
 * **No `<main>`/page-shell of its own** — `ConsoleShell` already renders one
 * around every provider page, the same note `booking-page.tsx` and
 * `quotes-page.tsx` both carry.
 */
export function ProviderQuotePage({ quoteId }: { quoteId: string }) {
  const { t, i18n } = useTranslation("quotes");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const { activeProvider } = useActiveProvider();
  const providerId = activeProvider?.id ?? "";

  const query = useProviderQuote(providerId, quoteId);
  const q = query.data;
  // Measured once per render, from the moment the answer arrived — the same
  // bargain `booking-page.tsx` and `quotes-page.tsx` both make for a clock
  // that must not move for a re-render nothing about the data caused.
  const now = useMemo(
    () => new Date(query.dataUpdatedAt || Date.now()),
    [query.dataUpdatedAt],
  );

  const answer = useAnswerQuote(providerId);
  // Two instances, not one shared between the form and the decline dialog:
  // a file picked while pricing a job and a file picked while explaining a
  // refusal are for two different mutations, and sharing one `useAttachments`
  // between them would carry whichever was picked first into whichever
  // dialog opens second.
  const proposeAttachments = useAttachments();
  const declineAttachments = useAttachments();

  // `null` means "no manual choice yet" — the panel defaults to showing the
  // form when there is nothing to display and the read-only proposal when
  // there is, and a press of "Rever proposta" or a successful send overrides
  // that default explicitly.
  const [editing, setEditing] = useState<boolean | null>(null);
  const [notice, setNotice] = useState<string | undefined>(undefined);
  const [declining, setDeclining] = useState(false);

  if (!activeProvider) return null;
  const slug = activeProvider.slug;

  const back = (
    <Link
      to="/provider/$slug/quotes"
      params={{ slug }}
      className="type-caption inline-flex items-center gap-1.5 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
    >
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
      {t("provider.back")}
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
          {t("provider.loadError")}
        </p>
      </div>
    );
  }
  if (!q) {
    return (
      <div className="mx-auto grid max-w-6xl gap-4">
        {back}
        <EmptyCard
          framed
          title={t("provider.notFoundTitle")}
          body={t("provider.notFoundBody")}
        />
      </div>
    );
  }

  /**
   * `validUntil: null` is the compare-and-swap saying it lost — the customer
   * accepted, withdrew, or the clock ran out while this form was open. The
   * refetch `useAnswerQuote`'s own `onSettled` already queued is the only
   * honest witness of what actually happened; all that is left here is to
   * not say the proposal was sent.
   */
  async function send(values: Omit<ProposeQuoteInput, "quoteId">) {
    setNotice(undefined);
    const uploaded = await proposeAttachments.uploadAll();
    if (uploaded === null) return;
    try {
      const { validUntil } = await answer.propose.mutateAsync({
        quoteId,
        ...values,
        ...(uploaded.length > 0 ? { attachments: uploaded } : {}),
      });
      if (validUntil === null) {
        setNotice("propose.errorMoved");
        return;
      }
      // Without this, `attachments.files` still carries whatever was staged
      // for the proposal just sent — the next "Rever proposta" would reopen
      // the form with them still attached, and sending the revision would
      // upload a second copy of each and attach it again. Every sibling
      // closing path resets its own attachments the same way: the
      // customer's `confirmClose` and this file's own decline dialog.
      proposeAttachments.reset();
      setEditing(false);
    } catch (error) {
      const code = error instanceof GraphqlError ? error.code : undefined;
      setNotice(PROPOSE_ERROR_COPY[code ?? ""] ?? "propose.errorGeneric");
    }
  }

  const hasLiveProposal = q.proposal !== null;
  const editingNow = editing ?? !hasLiveProposal;
  const busy = answer.propose.isPending || answer.decline.isPending || proposeAttachments.uploading;
  const declineBusy = answer.decline.isPending || declineAttachments.uploading;

  const location = [q.addressDistrict, q.addressCity].filter(Boolean).join(", ");
  const revised = revisionCount(q.proposals);
  const proposalWhen = q.proposal
    ? slotWording(q.proposal.startsAt, q.proposal.endsAt, locale, q.timezone)
    : null;
  // What "Rever proposta" opens the form pre-filled with — the live
  // proposal's own values, read back in the shapes the fields themselves
  // edit. `undefined` for a first proposal, which has nothing to revise
  // from; the form opens blank exactly as it always has.
  const revisionValues: ProposalFormInitialValues | undefined = q.proposal
    ? {
        price: priceDraft(q.proposal.priceMinor),
        ...fromInstant(q.proposal.startsAt, q.timezone),
        durationHours: durationDraft(q.proposal.durationMinutes),
        memberId: q.proposal.providerMemberId,
        note: q.proposal.note ?? "",
      }
    : undefined;

  return (
    <div className="mx-auto max-w-6xl">
      {back}

      <header className="mt-4">
        <h1 className="type-h1">{q.customerFirstName}</h1>
        <p className="type-body mt-1 text-[var(--color-muted-foreground)]">{q.serviceName}</p>
        <div className="mt-2">
          <QuoteStatusLine quote={q} side="provider" now={now} />
        </div>
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="min-w-0 grid gap-5">
          {/* O pedido */}
          <section className={CARD}>
            <h2 className="type-h3">{t("provider.requestTitle")}</h2>
            <p className="type-body mt-3 whitespace-pre-line">{q.description}</p>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              {q.neededBy && (
                <div>
                  <dt className={CAPTION}>{t("provider.neededByLabel")}</dt>
                  <dd className="type-body mt-1">
                    {/* `neededBy` is a calendar date with no zone of its
                        own — `UTC` is what makes the digits round-trip, the
                        same note the customer's own `quote-page.tsx` makes. */}
                    {new Intl.DateTimeFormat(locale, {
                      day: "numeric",
                      month: "long",
                      timeZone: "UTC",
                    }).format(new Date(q.neededBy))}
                  </dd>
                </div>
              )}
              {location !== "" && (
                <div>
                  <dt className={CAPTION}>{t("provider.whereLabel")}</dt>
                  <dd className="type-body mt-1">{location}</dd>
                  <dd className="type-caption mt-0.5 text-[var(--color-muted-foreground)]">
                    {t("provider.whereNote")}
                  </dd>
                </div>
              )}
            </dl>
            {q.requestAttachments.length > 0 && (
              <div className="mt-4">
                <QuoteAttachmentList attachments={q.requestAttachments} />
              </div>
            )}
          </section>

          {/* Quem pede */}
          <section className={CARD}>
            <h2 className="type-h3">{t("provider.whoAsks")}</h2>
            <p className="type-body-medium mt-2 font-semibold">{q.customerFirstName}</p>
            <p className="type-body mt-1 text-[var(--color-muted-foreground)]">
              {t("provider.completedBookings", { count: q.customerCompletedBookings })}
            </p>
          </section>

          {/* Historial */}
          <section className={CARD}>
            <h2 className="type-h3">{t("provider.historyTitle")}</h2>
            <ol className="mt-3 grid list-none gap-4 p-0">
              {q.closedReason && (
                <li className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3">
                  <span aria-hidden="true" />
                  <div>
                    <p className="type-body-medium font-semibold">
                      {t(`close.reason.${q.closedReason}`, { defaultValue: q.closedReason })}
                    </p>
                    {q.closedNote && <p className="type-body mt-1">{q.closedNote}</p>}
                    {q.closingAttachments.length > 0 && (
                      <div className="mt-1.5">
                        <QuoteAttachmentList attachments={q.closingAttachments} />
                      </div>
                    )}
                  </div>
                </li>
              )}
              <li className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3">
                <time className="type-caption text-[var(--color-muted-foreground)]">
                  {shortWhen(q.requestedAt, locale, q.timezone)}
                </time>
                <p className="type-body-medium font-semibold">{t("provider.requestReceived")}</p>
              </li>
            </ol>
          </section>
        </div>

        <aside className="grid gap-4 lg:sticky lg:top-6">
          {canPropose(q) && editingNow ? (
            <ProposalForm
              commissionBps={q.commissionBps}
              // No top-level currency on the quote itself, only on a
              // proposal that already exists — MZN is this launch's only
              // currency, the same fallback `formatMoney` callers across the
              // app already make (see `DEFAULT_OPTION_CURRENCY`).
              currency={q.proposal?.currency ?? "MZN"}
              performers={q.performers}
              timezone={q.timezone}
              onSubmit={send}
              busy={busy}
              notice={notice}
              isRevision={hasLiveProposal}
              initialValues={revisionValues}
              attachments={proposeAttachments}
            />
          ) : q.proposal ? (
            <section className={CARD}>
              {/* "Proposta enviada" the instant this page is the one that
                  sent it — `editing === false` only ever happens by a
                  successful `send` below, never by loading a quote that was
                  already `PROPOSED` before this page opened (`editing` stays
                  `null` there, deriving `editingNow` straight from
                  `hasLiveProposal`). Loading the same page again a minute
                  later reads the plain "A sua proposta" instead: it is no
                  longer news. */}
              <h2 className="type-h3">
                {t(editing === false ? "propose.sentTitle" : "propose.title")}
              </h2>
              <p className="mt-2">
                <span className="type-display text-[var(--color-primary)] tabular-nums">
                  {formatMoney(q.proposal.priceMinor, q.proposal.currency, locale)}
                </span>
              </p>
              <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <dt className={CAPTION}>{t("propose.dateLabel")}</dt>
                  <dd className="type-body mt-1">{proposalWhen!.date}</dd>
                </div>
                <div>
                  <dt className={CAPTION}>{t("propose.timeLabel")}</dt>
                  <dd className="type-body mt-1 tabular-nums">
                    {proposalWhen!.start} – {proposalWhen!.end}
                  </dd>
                </div>
                <div>
                  <dt className={CAPTION}>{t("propose.durationLabel")}</dt>
                  <dd className="type-body mt-1">
                    {durationWording(q.proposal.durationMinutes, t)}
                  </dd>
                </div>
                <div>
                  <dt className={CAPTION}>{t("propose.memberLabel")}</dt>
                  <dd className="type-body mt-1">{q.proposal.memberFirstName}</dd>
                </div>
              </dl>
              {q.proposal.note && (
                <p className="type-body mt-3 whitespace-pre-line rounded-[var(--radius-card-sm)] bg-[color-mix(in_srgb,var(--color-primary)_6%,transparent)] p-3.5">
                  {q.proposal.note}
                </p>
              )}
              {q.proposal.attachments.length > 0 && (
                <div className="mt-3">
                  <QuoteAttachmentList attachments={q.proposal.attachments} />
                </div>
              )}
              <p className="type-caption mt-3 text-[var(--color-muted-foreground)]">
                {/* `revised` carries its own `{{count}}` and an `_one` variant
                    — the customer side's `detail.stepProposedRevised` already
                    does the same for the identical fact, and a fixed "revista
                    uma vez" regardless of count would misstate a second or
                    third revision. */}
                {t(revised > 0 ? "clock.provider.revised" : "clock.provider.validUntil", {
                  when: longWhen(q.proposal.validUntil, locale, q.timezone),
                  count: revised,
                })}
              </p>
              {canPropose(q) && (
                <button
                  type="button"
                  onClick={() => {
                    setNotice(undefined);
                    setEditing(true);
                  }}
                  className="type-body-medium mt-3 font-semibold text-[var(--color-primary)] hover:underline"
                >
                  {t("propose.reviseAction")}
                </button>
              )}
            </section>
          ) : null}

          <div className="flex flex-wrap items-center gap-4">
            {q.threadId && (
              <Link
                to="/messages"
                search={{ thread: q.threadId }}
                className="type-body-medium font-semibold text-[var(--color-primary)] hover:underline"
              >
                {t("provider.chatWith", { name: q.customerFirstName })}
              </Link>
            )}
            {canDecline(q) && (
              <button
                type="button"
                onClick={() => {
                  setNotice(undefined);
                  setDeclining(true);
                }}
                className="type-body-medium font-semibold text-[var(--color-destructive)] hover:underline"
              >
                {t("propose.decline")}
              </button>
            )}
          </div>
        </aside>
      </div>

      {declining && (
        <CloseQuoteDialog
          kind="decline"
          reasons={QUOTE_PROVIDER_DECLINE_REASONS}
          otherName={q.customerFirstName}
          attachments={declineAttachments}
          busy={declineBusy}
          notice={notice}
          onConfirm={async (v) => {
            setNotice(undefined);
            const uploaded = await declineAttachments.uploadAll();
            if (uploaded === null) return;
            try {
              const { applied } = await answer.decline.mutateAsync({
                quoteId,
                reason: v.reason as QuoteProviderDeclineReason,
                ...(v.note ? { note: v.note } : {}),
                ...(uploaded.length > 0 ? { attachments: uploaded } : {}),
              });
              // `applied: false` is the same compare-and-swap loss `send`
              // above reads off `validUntil: null` — the quote moved on
              // while the dialog sat open, and the refetch already queued
              // is the only thing left to trust.
              if (!applied) {
                setNotice("provider.movedOn");
                return;
              }
              setDeclining(false);
              declineAttachments.reset();
            } catch (error) {
              const code = error instanceof GraphqlError ? error.code : undefined;
              setNotice(
                code === "CONTACT_DETECTED"
                  ? "propose.errorContact"
                  : code === "QUOTE_TRANSITION"
                    ? "provider.movedOn"
                    : "propose.errorGeneric",
              );
            }
          }}
          onClose={() => {
            setDeclining(false);
            setNotice(undefined);
            declineAttachments.reset();
          }}
        />
      )}
    </div>
  );
}
