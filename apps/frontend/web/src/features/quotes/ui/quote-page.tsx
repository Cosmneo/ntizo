import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { QUOTE_CUSTOMER_REJECT_REASONS, type QuoteCustomerRejectReason } from "@ntizo/shared";
import { Skeleton, buttonVariants } from "@ntizo/frontend-ui";
import { EmptyCard } from "@/shared/components/empty-card";
import { GraphqlError } from "@/shared/lib/graphql/session-graphql";
import { formatMoney } from "@/features/wallet/domain/money";
import { momentWording, slotWording } from "@/features/checkout/domain/slot-wording";
import { useAttachments } from "@/features/messaging/viewmodel/use-attachments";
import {
  canAccept,
  canReject,
  canWithdraw,
  revisionCount,
} from "@/features/quotes/domain/status";
import { useCloseQuote, useMyQuote, type QuoteProposalDTO } from "@/features/quotes/viewmodel/use-my-quotes";
import { QuoteStatusLine } from "./quote-status";
import { QuoteAttachmentList } from "./attachment-list";
import { CloseQuoteDialog } from "./close-dialog";

const CAPTION =
  "type-caption font-bold tracking-[0.14em] text-[var(--color-muted-foreground)] uppercase";
const CARD = "rounded-[var(--radius-card)] border border-[var(--color-border)] p-5";

/** "3 Set, 10:12" — the short form the mockup's history entries use for a timestamp beside a headline. */
function shortWhen(iso: string, locale: string, timeZone: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso));
}

/** "sábado, 20 de setembro, 16:40" — one instant, for the rail and the history. */
function longWhen(iso: string, locale: string, timeZone: string): string {
  const at = momentWording(iso, locale, timeZone);
  return `${at.date}, ${at.time}`;
}

/** "4 horas" when the job runs in whole hours, "45 minutos" otherwise — the two shapes `detail.durationHours`/`detail.durationMinutes` cover. */
function durationWording(minutes: number, t: (key: string, opts?: Record<string, unknown>) => string): string {
  return minutes % 60 === 0
    ? t("detail.durationHours", { count: minutes / 60 })
    : t("detail.durationMinutes", { count: minutes });
}

/**
 * A sentence with one substring struck through, without touching the locale
 * string itself — `close.reason.*` and this file's own keys stay plain text
 * in all eight locales, and `needle` (an already-formatted price, unlikely to
 * repeat inside its own short sentence) marks the one span to draw a line
 * through. Falls back to the whole sentence, undecorated, on the rare miss.
 */
function withStrike(sentence: string, needle: string): { before: string; struck: string; after: string } {
  const at = sentence.indexOf(needle);
  if (at === -1) return { before: sentence, struck: "", after: "" };
  return { before: sentence.slice(0, at), struck: needle, after: sentence.slice(at + needle.length) };
}

/**
 * The proposal, on the customer's side (plate 4): the price first, the
 * request and every earlier proposal as history below it, and a rail saying
 * who and how far along.
 *
 * Follows `bookings/ui/booking-page.tsx` for shape — every hook above the
 * loading/error/not-found ladder, the two-column body with the rail first on
 * a phone, one clock read once per render. What is different is the header
 * button: this page has exactly one filled control, and it names the amount
 * — "Aceitar e pagar 9800,00 MTn", never "Confirmar" or "Continuar".
 *
 * **No `<main>`/`page-shell` of its own** — `_customer`'s own `CustomerShell`
 * already renders both around every page in this layout; Task 7's own page
 * shipped that bug once already.
 */
export function QuotePage({ quoteId }: { quoteId: string }) {
  const { t, i18n } = useTranslation("quotes");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const query = useMyQuote(quoteId);
  const q = query.data;
  // Measured once per render, from the moment the answer arrived — the same
  // bargain `booking-page.tsx` and `quotes-page.tsx` both make for a
  // countdown that must not move for a re-render nothing about the data
  // caused.
  const now = useMemo(
    () => new Date(query.dataUpdatedAt || Date.now()),
    [query.dataUpdatedAt],
  );

  const close = useCloseQuote();
  const [dialog, setDialog] = useState<"reject" | "withdraw" | null>(null);
  const [notice, setNotice] = useState<string | undefined>(undefined);
  // The one `useAttachments` instance behind both the close dialog's picker
  // and the upload this page runs before writing — sharing it is what lets
  // `confirmClose` below call `uploadAll()` and see exactly the files the
  // dialog's own picker collected, rather than a second, always-empty list.
  const attachments = useAttachments();

  async function confirmClose(v: { reason: string | null; note: string; files: File[] }) {
    setNotice(undefined);
    const uploaded = await attachments.uploadAll();
    if (uploaded === null) return;
    const payload = {
      quoteId,
      ...(v.note ? { note: v.note } : {}),
      ...(uploaded.length > 0 ? { attachments: uploaded } : {}),
    };
    try {
      const result =
        dialog === "reject"
          ? await close.reject.mutateAsync({ ...payload, reason: v.reason as QuoteCustomerRejectReason })
          : await close.withdraw.mutateAsync(payload);
      // `applied: false` is the compare-and-swap saying it lost. The
      // refetch has already been queued by the hook's own `onSettled`; all
      // that is left here is to not claim it worked.
      if (!result.applied) {
        setNotice("close.errorMoved");
        return;
      }
      setDialog(null);
      attachments.reset();
    } catch (error) {
      const code = error instanceof GraphqlError ? error.code : undefined;
      setNotice(
        code === "CONTACT_DETECTED"
          ? "close.errorContact"
          : code === "QUOTE_TRANSITION"
            ? "close.errorMoved"
            : "close.errorGeneric",
      );
    }
  }

  const back = (
    <Link
      to="/quotes"
      className="type-caption inline-flex items-center gap-1.5 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
    >
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
      {t("detail.back")}
    </Link>
  );

  if (query.isLoading) {
    return (
      <>
        {back}
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-48 w-full" />
      </>
    );
  }

  if (query.isError) {
    return (
      <>
        {back}
        <p role="alert" className="type-body text-[var(--color-destructive)]">
          {t("detail.loadError")}
        </p>
      </>
    );
  }

  if (!q) {
    return (
      <>
        {back}
        <EmptyCard framed title={t("detail.notFoundTitle")} body={t("detail.notFoundBody")} />
      </>
    );
  }

  const proposal = q.proposal;
  // Whole-unit, comma-grouped and currency-free on purpose — the mockup's
  // "price at 40px in navy with the currency beside it" is two spans, not
  // one formatted string; `formatMoney` (exact, with its own currency
  // symbol) is what the accept button names instead, because that is the
  // number actually charged.
  const priceAmount = proposal
    ? new Intl.NumberFormat(locale, { maximumFractionDigits: 0, useGrouping: "always" }).format(
        proposal.priceMinor / 100,
      )
    : null;
  const acceptAmount = proposal ? formatMoney(proposal.priceMinor, proposal.currency, locale) : null;
  const proposalWhen = proposal ? slotWording(proposal.startsAt, proposal.endsAt, locale, q.timezone) : null;

  const superseded = [...q.proposals]
    .filter((p) => p.supersededAt !== null)
    .sort((a, b) => new Date(b.supersededAt!).getTime() - new Date(a.supersededAt!).getTime());
  const revised = revisionCount(q.proposals);
  const hasHadProposal = q.proposal !== null || q.proposals.length > 0;
  const decided = q.status !== "REQUESTED" && q.status !== "PROPOSED";

  return (
    <div>
      {back}

      <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="order-2 grid gap-5 lg:order-1">
          {/* 1. Header */}
          <div>
            <h1 className="type-h1">{q.serviceName}</h1>
            <p className="type-body mt-1.5 flex flex-wrap items-center gap-1.5 text-[var(--color-muted-foreground)]">
              {q.providerName}
              <span aria-hidden="true">·</span>
              <QuoteStatusLine quote={q} side="customer" now={now} />
            </p>
          </div>

          {/* 2. The proposal, when there is one */}
          {proposal && (
            <section className={CARD}>
              <p className="flex flex-wrap items-baseline gap-2">
                <span className="type-display text-[var(--color-primary)] tabular-nums">
                  {priceAmount}
                </span>
                <span className="type-caption text-[var(--color-muted-foreground)]">
                  {proposal.currency}
                </span>
              </p>
              <p className="type-body-medium mt-3 font-semibold">
                {proposalWhen!.date} · {proposalWhen!.start} às {proposalWhen!.end}
              </p>
              <p className="type-body mt-1 text-[var(--color-muted-foreground)]">
                {durationWording(proposal.durationMinutes, t)} ·{" "}
                {t("detail.memberDoes", { name: proposal.memberFirstName })}
              </p>
              {proposal.note && (
                <p className="type-body mt-3 whitespace-pre-line rounded-[var(--radius-card-sm)] bg-[color-mix(in_srgb,var(--color-primary)_6%,transparent)] p-3.5">
                  {proposal.note}
                </p>
              )}
              {proposal.attachments.length > 0 && (
                <div className="mt-3">
                  <QuoteAttachmentList attachments={proposal.attachments} />
                </div>
              )}
              <p className="type-caption mt-3 flex items-center gap-1.5 text-[var(--color-muted-foreground)]">
                {t("detail.validUntil", { when: longWhen(proposal.validUntil, locale, q.timezone) })}
              </p>
            </section>
          )}

          {/* 3. Actions — always one section, whichever of the four the
              status calls for. */}
          <section className={CARD}>
            {canAccept(q) ? (
              <div className="flex flex-wrap items-center gap-4">
                <Link to="/quotes/$quoteId/accept" params={{ quoteId }} className={buttonVariants()}>
                  {t("detail.accept", { amount: acceptAmount })}
                </Link>
                {canReject(q) && (
                  <button
                    type="button"
                    onClick={() => setDialog("reject")}
                    className="type-body-medium font-semibold text-[var(--color-destructive)] hover:underline"
                  >
                    {t("detail.reject")}
                  </button>
                )}
                {q.threadId && (
                  <Link
                    to="/messages"
                    search={{ thread: q.threadId }}
                    className="type-body-medium font-semibold text-[var(--color-primary)] hover:underline"
                  >
                    {t("detail.chat")}
                  </Link>
                )}
              </div>
            ) : q.status === "ACCEPTED" && q.bookingId ? (
              <Link to="/bookings/$bookingId" params={{ bookingId: q.bookingId }} className={buttonVariants()}>
                {t("detail.seeBooking")}
              </Link>
            ) : q.status === "REQUESTED" ? (
              <>
                <p className="type-body">
                  {t("detail.waitingBody", {
                    provider: q.providerName,
                    when: q.expiresAt ? longWhen(q.expiresAt, locale, q.timezone) : "",
                  })}
                </p>
                {q.threadId && (
                  <Link
                    to="/messages"
                    search={{ thread: q.threadId }}
                    className="type-body-medium mt-3 inline-block font-semibold text-[var(--color-primary)] hover:underline"
                  >
                    {t("detail.chat")}
                  </Link>
                )}
              </>
            ) : (
              <p className="type-body-medium font-semibold">{t("detail.closedTitle")}</p>
            )}
          </section>

          {/* 4. O seu pedido */}
          <section className={CARD}>
            <h2 className="type-h3 flex flex-wrap items-baseline gap-2">
              {t("detail.yourRequest")}
              <small className="type-caption font-normal text-[var(--color-muted-foreground)]">
                {shortWhen(q.requestedAt, locale, q.timezone)}
              </small>
            </h2>
            <p className="type-body mt-3 whitespace-pre-line">{q.description}</p>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              {q.neededBy && (
                <div>
                  <dt className={CAPTION}>{t("detail.neededByLabel")}</dt>
                  <dd className="type-body mt-1">
                    {new Intl.DateTimeFormat(locale, { day: "numeric", month: "long" }).format(
                      new Date(q.neededBy),
                    )}
                  </dd>
                </div>
              )}
              {q.address && (
                <div>
                  <dt className={CAPTION}>{t("detail.whereLabel")}</dt>
                  <dd className="type-body mt-1">
                    {[q.address.label, q.address.line, q.address.district, q.address.city]
                      .filter(Boolean)
                      .join(", ")}
                  </dd>
                </div>
              )}
            </dl>
            {q.requestAttachments.length > 0 && (
              <div className="mt-4">
                <p className={CAPTION}>{t("detail.photosLabel")}</p>
                <div className="mt-1.5">
                  <QuoteAttachmentList attachments={q.requestAttachments} />
                </div>
              </div>
            )}
          </section>

          {/* 5. Antes desta proposta */}
          <section className={CARD}>
            <h2 className="type-h3">{t("detail.historyTitle")}</h2>
            <ol className="mt-3 grid list-none gap-4 p-0">
              {superseded.map((p: QuoteProposalDTO) => {
                const when = slotWording(p.startsAt, p.endsAt, locale, q.timezone);
                const priceText = formatMoney(p.priceMinor, p.currency, locale);
                const headline = t("detail.supersededPrice", {
                  price: priceText,
                  when: `${when.date}, ${durationWording(p.durationMinutes, t)}`,
                });
                const parts = withStrike(headline, priceText);
                return (
                  <li key={p.id} className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3">
                    <time className="type-caption text-[var(--color-muted-foreground)]">
                      {shortWhen(p.supersededAt!, locale, q.timezone)}
                    </time>
                    <div>
                      <p className="type-body-medium font-semibold">
                        {parts.before}
                        <s>{parts.struck}</s>
                        {parts.after}
                      </p>
                      <p className="type-body mt-1 text-[var(--color-muted-foreground)]">
                        {t("detail.supersededBy", { when: longWhen(p.supersededAt!, locale, q.timezone) })}
                      </p>
                      {p.note && <p className="type-body mt-1">{p.note}</p>}
                    </div>
                  </li>
                );
              })}
              <li className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3">
                <time className="type-caption text-[var(--color-muted-foreground)]">
                  {shortWhen(q.requestedAt, locale, q.timezone)}
                </time>
                <div>
                  <p className="type-body-medium font-semibold">{t("detail.requestSent")}</p>
                  {q.status === "REQUESTED" && q.expiresAt && (
                    <p className="type-body mt-1 text-[var(--color-muted-foreground)]">
                      {t("detail.respondByWas", {
                        provider: q.providerName,
                        when: longWhen(q.expiresAt, locale, q.timezone),
                      })}
                    </p>
                  )}
                </div>
              </li>
            </ol>
          </section>
        </div>

        <aside className="order-1 grid gap-4 lg:order-2 lg:sticky lg:top-6">
          <section className={CARD}>
            <h2 className={CAPTION}>{t("detail.railWho")}</h2>
            <div className="mt-3 flex items-center gap-3">
              <span
                aria-hidden="true"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--color-muted)] text-[13px] font-semibold text-[var(--color-primary)]"
              >
                {q.providerName.slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0">
                <Link
                  to="/providers/$slug"
                  params={{ slug: q.providerSlug }}
                  className="type-body-medium block truncate font-semibold hover:underline"
                >
                  {q.providerName}
                </Link>
                {q.providerVerified && (
                  <p className="type-caption text-[var(--color-muted-foreground)]">
                    {t("request.verified")}
                  </p>
                )}
              </div>
            </div>
          </section>

          <section className={CARD}>
            <h2 className={CAPTION}>{t("detail.railProgress")}</h2>
            <ol className="mt-3 grid list-none gap-3 p-0">
              {[
                { key: "stepRequested", done: true, note: undefined as string | undefined },
                {
                  key: "stepProposed",
                  done: hasHadProposal,
                  note: revised > 0 ? t("detail.stepProposedRevised", { count: revised }) : undefined,
                },
                { key: "stepDecision", done: decided, note: undefined },
                { key: "stepPayment", done: q.status === "ACCEPTED", note: t("detail.stepPaymentBody") },
                { key: "stepConfirmed", done: false, note: t("detail.stepConfirmedBody") },
              ].map((step) => (
                <li key={step.key} className="grid grid-cols-[1rem_minmax(0,1fr)] gap-x-3">
                  <span
                    aria-hidden="true"
                    className={`mt-1.5 h-2.5 w-2.5 rounded-full ${
                      step.done ? "bg-[var(--color-primary)]" : "border-2 border-[var(--color-border)]"
                    }`}
                  />
                  <div>
                    <p
                      className={
                        step.done
                          ? "type-body-medium font-semibold"
                          : "type-body-medium text-[var(--color-muted-foreground)]"
                      }
                    >
                      {t(`detail.${step.key}`)}
                    </p>
                    {step.note && (
                      <p className="type-caption text-[var(--color-muted-foreground)]">{step.note}</p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <p className="type-caption text-[var(--color-muted-foreground)]">{t("detail.railFooter")}</p>

          {canWithdraw(q) && (
            <button
              type="button"
              onClick={() => setDialog("withdraw")}
              className="type-caption justify-self-start text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
            >
              {t("detail.withdraw")}
            </button>
          )}
        </aside>
      </div>

      {dialog && (
        <CloseQuoteDialog
          kind={dialog}
          reasons={dialog === "reject" ? QUOTE_CUSTOMER_REJECT_REASONS : null}
          otherName={q.providerName}
          attachments={attachments}
          onConfirm={confirmClose}
          onClose={() => {
            setDialog(null);
            setNotice(undefined);
            attachments.reset();
          }}
          busy={close.reject.isPending || close.withdraw.isPending || attachments.uploading}
          notice={notice}
        />
      )}
    </div>
  );
}
