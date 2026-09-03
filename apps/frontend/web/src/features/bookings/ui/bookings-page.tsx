import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { CalendarDays } from "lucide-react";
import { Button, cn } from "@ntizo/frontend-ui";
import { CollectionCard } from "@/shared/components/collection-card";
import { compactSlotWording } from "@/features/checkout/domain/slot-wording";
import { formatHeadlinePrice } from "@/features/directory/services/domain/service-card";
import {
  CUSTOMER_BOOKING_TABS,
  canCancel,
  canPay,
  deadlineOf,
  timeLeftWording,
  type CustomerBookingStatus,
  type CustomerBookingTab,
} from "../domain/status";
import { useMyBookings } from "../viewmodel/use-my-bookings";
import { BookingStatusBadge } from "./booking-status-badge";

/** The countdown's colour: amber while the provider is deciding, blue while the customer is. */
function countdownTone(status: CustomerBookingStatus): string {
  return status === "PENDING_PAYMENT"
    ? "text-[var(--color-primary)]"
    : "text-[#8a5b00]";
}

/**
 * The customer's own bookings, one tab at a time.
 *
 * Three tabs by what is still open, what is coming up, and what is over —
 * the same split the provider zone made for the same reason: ten statuses
 * are the system's vocabulary, not a customer's. Unlike the provider's list,
 * paging lives in the URL rather than component state (`?offset=`, see the
 * route's `validateSearch`): a customer's own history is short enough that a
 * bookmarked or refreshed page landing on "page 2" is worth more than an
 * infinite-scroll accumulator built for a workspace with hundreds of rows.
 *
 * No search box: the mockup draws none, `bookingMine` carries no `q` the way
 * the provider's `bookingForProvider` does, and a client-side filter over a
 * paged list would tell a customer "no matches" about a booking that is
 * merely on the next page. `CollectionCard`'s `hideSearch` opts out of the
 * control entirely rather than shipping one that lies.
 */
export function BookingsPage() {
  const { t, i18n } = useTranslation("bookings");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as {
    tab?: CustomerBookingTab;
    offset?: number;
  };
  const tab: CustomerBookingTab = search.tab ?? CUSTOMER_BOOKING_TABS[0];
  const offset = search.offset ?? 0;

  const query = useMyBookings({ tab, offset });
  const data = query.data;
  // Measured from the moment the page was answered, not from whenever React
  // last re-rendered — see the provider list's own `now`, which this mirrors.
  const now = useMemo(
    () => new Date(query.dataUpdatedAt || Date.now()),
    [query.dataUpdatedAt],
  );

  const setTab = (next: CustomerBookingTab) =>
    void navigate({ to: "/bookings", search: { tab: next } });

  const items = data?.items ?? [];

  return (
    <div>
      <h1 className="type-h1">{t("title")}</h1>
      <p className="type-body mt-2 max-w-[62ch] text-[var(--color-muted-foreground)]">
        {t("lede")}
      </p>

      <div
        role="tablist"
        aria-label={t("title")}
        className="mt-6 inline-flex rounded-full bg-[var(--color-muted)] p-1"
      >
        {CUSTOMER_BOOKING_TABS.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-semibold transition-colors",
              tab === key
                ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]",
            )}
          >
            {t(`tab.${key}`)}
            {data && (
              <span
                className={cn(
                  "ml-1.5 inline-block rounded-full px-1.5 py-0.5 text-xs font-semibold",
                  tab === key
                    ? "bg-white/25"
                    : "bg-[var(--color-background)] text-[var(--color-muted-foreground)]",
                )}
              >
                {data.counts[key]}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="mt-4">
        <CollectionCard
          title={t(`tab.${tab}`)}
          shown={items.length}
          total={data?.total ?? 0}
          loading={query.isLoading}
          hideSearch
          columns={[
            { key: "service", label: t("col.service"), className: "pl-5" },
            { key: "when", label: t("col.when"), skeletonWidth: "w-28" },
            {
              key: "status",
              label: t("col.status"),
              skeletonWidth: "w-24",
              skeletonShape: "badge",
            },
            {
              key: "price",
              label: t("col.price"),
              align: "right",
              skeletonWidth: "w-20",
            },
            { key: "actions", label: "", className: "pr-5" },
          ]}
          emptyTitle={t("emptyTitle")}
          emptyText={t("emptyBody")}
          emptyBadge={CalendarDays}
          emptyAction={
            <Link
              to="/services"
              className="rounded-full bg-[var(--color-primary)] px-5 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              {t("emptyAction")}
            </Link>
          }
          // Unreachable with `hideSearch` — there is no filter left to hide
          // anything behind — but the prop is still required, and reusing
          // the empty state's own body is truer than inventing a sentence
          // for a state this page cannot enter.
          noMatchesText={t("emptyBody")}
          filtered={false}
          rows={items.map((b) => {
            const slot = compactSlotWording(
              b.startsAt,
              b.endsAt,
              locale,
              b.timezone,
            );
            const deadline = deadlineOf(b);
            const left = deadline ? timeLeftWording(deadline, now) : null;
            // `canCancel` and `canPay` are the domain's answer, and both are
            // true for `PENDING_PAYMENT` — cancelling is still on the table
            // right up until it's paid, which is exactly what the detail
            // page (both buttons at once) needs to know. This list's own row
            // has room for one action, and paying is the one actually being
            // waited on there; a waiting-for-provider row has nothing to pay
            // yet, so it gets the only action that applies: cancel.
            const showPay = canPay(b.status);
            const showCancel = canCancel(b.status) && !showPay;
            return {
              key: b.id,
              primary: (
                <div>
                  <Link
                    to="/bookings/$bookingId"
                    params={{ bookingId: b.id }}
                    className="type-body-medium font-semibold hover:underline"
                  >
                    {b.serviceName}
                    {b.optionName ? ` · ${b.optionName}` : ""}
                  </Link>
                  <p className="type-caption mt-0.5 flex items-center gap-1.5 text-[var(--color-muted-foreground)]">
                    {b.providerName}
                    {b.providerVerified && (
                      <span className="font-semibold text-[var(--color-primary)]">
                        ✓ {t("verified")}
                      </span>
                    )}
                  </p>
                </div>
              ),
              cells: {
                when: (
                  <span className="tabular-nums">
                    {slot.date}
                    <span className="block text-[var(--color-muted-foreground)]">
                      {slot.start} ·{" "}
                      {t("minutes", { count: b.durationMinutes })}
                    </span>
                  </span>
                ),
                status: (
                  <span className="inline-flex flex-col items-start gap-1">
                    <BookingStatusBadge status={b.status} />
                    {left && (
                      <span
                        className={cn(
                          "type-caption font-semibold",
                          countdownTone(b.status),
                        )}
                      >
                        {b.status === "PENDING_PAYMENT"
                          ? t("payIn", { time: left })
                          : t("respondIn", { time: left })}
                      </span>
                    )}
                  </span>
                ),
                price: (
                  <span className="tabular-nums">
                    {formatHeadlinePrice(b.priceMinor, b.currency, locale)}
                  </span>
                ),
              },
              // One action, never two: a confirmed booking has nothing to do
              // here at all, and a `PENDING_PAYMENT` row shows only Pagar —
              // both buttons together belong to the detail page, not this
              // row (see the comment on `showPay`/`showCancel` above).
              actions: showPay ? (
                <Button type="button" size="sm" disabled>
                  {t("pay")}
                </Button>
              ) : showCancel ? (
                // A `<button>`, not a link: it opens a dialog rather than
                // navigating (wired in Task 9). Styled quietly, as the
                // mockup draws it — this is not the page's primary action.
                <button
                  type="button"
                  disabled
                  className="type-caption font-medium text-[var(--color-muted-foreground)] hover:underline disabled:pointer-events-none disabled:opacity-50"
                >
                  {t("cancel")}
                </button>
              ) : undefined,
            };
          })}
        />
      </div>

      {data && data.nextOffset !== null && (
        <div className="mt-4 flex justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              void navigate({
                to: "/bookings",
                search: { tab, offset: data.nextOffset! },
              })
            }
          >
            {t("loadMore")}
          </Button>
        </div>
      )}
    </div>
  );
}
