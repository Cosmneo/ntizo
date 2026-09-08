import { Link } from "@tanstack/react-router";
import type { TFunction } from "i18next";
import type {
  CollectionColumn,
  CollectionRow,
} from "@/shared/components/collection-card";
import { formatMoney } from "@/features/wallet/domain/money";
import { payoutMinorOf } from "@/features/quotes/domain/money-split";
import { coarseDuration } from "@/features/quotes/domain/status";
import { QuoteStatusLine } from "@/features/quotes/ui/quote-status";
import type { ProviderQuoteDTO } from "../viewmodel/use-provider-quotes";

/**
 * The queue's four columns, built once for the reasons `bookingColumns`
 * gives: pure functions rather than components, so a row is data the card
 * can lay out two ways rather than a `<tr>` it is stuck with.
 */
export function quoteColumns(t: TFunction<"quotes">): CollectionColumn[] {
  return [
    { key: "customer", label: t("provider.column.customer"), className: "pl-5" },
    { key: "service", label: t("provider.column.service"), skeletonWidth: "w-56" },
    {
      key: "status",
      label: t("provider.column.status"),
      skeletonWidth: "w-32",
      skeletonShape: "badge",
    },
    {
      key: "price",
      label: t("provider.column.price"),
      align: "right",
      skeletonWidth: "w-24",
      className: "pr-5",
    },
  ];
}

/**
 * One row of the queue.
 *
 * `primary` stays the identity link and nothing else — a monogram and the
 * customer's first name — exactly as `bookingRow`'s does: the only link on
 * the row, and there is no row click handler.
 *
 * The request's own facts — what it is, where, how long ago, how many
 * photos, and the note itself — sit together under the service name in the
 * "Serviço" cell instead. Bundling them there rather than into `primary`
 * keeps `row(serviceName)` able to find the service's own text node without
 * colliding with a second copy of it in the identity column, and it keeps
 * every one of those facts on the mobile card too — unlike a booking's
 * status, none of this is already said by `primary`, so nothing here is
 * marked `hideOnCard`.
 */
export function quoteRow(
  q: ProviderQuoteDTO,
  ctx: {
    slug: string;
    locale: string;
    now: Date;
    t: TFunction<"quotes">;
    /**
     * The workspace's own rate, read by the page from the console shell's
     * provider detail — not on `ProviderQuoteDTO`, only on the detail. While
     * it has not loaded yet, the "recebe" line is omitted rather than
     * guessed at.
     */
    commissionBps: number | undefined;
  },
): CollectionRow {
  const { slug, locale, now, t, commissionBps } = ctx;

  const location = [q.addressDistrict, q.addressCity].filter(Boolean).join(", ");
  const askedFor = coarseDuration(now.getTime() - new Date(q.requestedAt).getTime());
  const askedAgo = askedFor
    ? t("clock.provider.askedAgo", { ago: t(`unit.${askedFor.unit}`, { count: askedFor.count }) })
    : null;
  const photos =
    q.attachmentCount > 0
      ? t("provider.photos", { count: q.attachmentCount })
      : t("provider.noPhotos");

  const priceNode = q.proposal ? (
    <span className="inline-flex flex-col items-end gap-0.5">
      <p className="type-body-medium tabular-nums">
        {formatMoney(q.proposal.priceMinor, q.proposal.currency, locale)}
      </p>
      {commissionBps !== undefined && (
        <p className="type-caption tabular-nums text-[var(--color-muted-foreground)]">
          {t("provider.receives", {
            amount: formatMoney(
              payoutMinorOf(q.proposal.priceMinor, commissionBps),
              q.proposal.currency,
              locale,
            ),
          })}
        </p>
      )}
    </span>
  ) : null;

  return {
    key: q.id,
    primary: (
      <Link
        to="/provider/$slug/quotes/$quoteId"
        params={{ slug, quoteId: q.id }}
        className="flex items-center gap-2"
      >
        <span
          aria-hidden="true"
          className="type-caption grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--color-muted)] font-semibold uppercase"
        >
          {q.customerFirstName.slice(0, 1)}
        </span>
        <span className="type-body-medium font-semibold hover:underline">
          {q.customerFirstName}
        </span>
      </Link>
    ),
    cells: {
      service: (
        <div className="min-w-0">
          <p className="type-body-medium font-medium">{q.serviceName}</p>
          <p className="type-caption mt-0.5 text-[var(--color-muted-foreground)]">
            {location && <span>{location}</span>}
            {location && " · "}
            {askedAgo && <span>{askedAgo}</span>}
            {askedAgo && " · "}
            <span>{photos}</span>
          </p>
          <p className="type-caption mt-0.5 truncate text-[var(--color-muted-foreground)]">
            {q.descriptionSnippet}
          </p>
        </div>
      ),
      status: <QuoteStatusLine quote={q} side="provider" now={now} />,
      ...(priceNode ? { price: priceNode } : {}),
    },
  };
}
