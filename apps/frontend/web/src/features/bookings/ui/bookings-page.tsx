import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { ArrowRight, CalendarDays } from "lucide-react";
import { Button, cn } from "@ntizo/frontend-ui";
import type { BookingDTO, CustomerBookingPageDTO } from "@ntizo/shared/read-models";
import { BrandImage } from "@/shared/components/brand-image";
import { CollectionCard } from "@/shared/components/collection-card";
import { MessageProviderButton } from "@/features/directory/ui/provider-rail";
import { compactSlotWording } from "@/features/checkout/domain/slot-wording";
import { formatAmount } from "@/features/directory/services/domain/service-card";
import { useCurrentUser } from "@/features/user/viewmodel/use-current-user";
import {
  CUSTOMER_BOOKING_TABS,
  CUSTOMER_BOOKINGS_PAGE_SIZE,
  canCancel,
  canPay,
  deadlineOf,
  timeLeftWording,
  type CustomerBookingStatus,
  type CustomerBookingTab,
} from "../domain/status";
import { useMyBookings } from "../viewmodel/use-my-bookings";
import { BookingStatusBadge } from "./booking-status-badge";
import { CancelDialog } from "./cancel-dialog";
import { PayDialog } from "./pay-dialog";

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
 * are the system's vocabulary, not a customer's.
 *
 * **Paging is the provider list's own shape: "Mais" *adds* the next page
 * under the rows already there.** It was a URL offset (`?offset=`) that
 * replaced the page instead, which broke three ways at once — the rows the
 * reader was looking at vanished, `CollectionCard`'s own header went on
 * saying "20 de 45" while showing rows 21 to 40, and there was no control
 * that went back, so page 1 was reachable only by clicking the tab already
 * marked active. A bookmarkable "page 2" was the reason offset lived in the
 * URL; it is not worth those three, and the provider's list settled this
 * question already — see its `loaded`/`page` pair, which this mirrors down
 * to why both are needed.
 *
 * **The narrow screen is composed rather than labelled.** `CollectionCard`'s
 * own mobile card stacks every value under its column's name — "Quando",
 * "Estado", "Valor", one line each — which is right for a list of people and
 * wrong here: on a phone this list is read by scanning for a status and a
 * price, and those two want to share a line rather than sit under two words
 * of chrome. So all three columns are `hideOnCard` and the row hands the card
 * a `cardBody` instead. The table above `md` is untouched and still reads
 * every value off `cells`, which is what stops the two from becoming two
 * designs — see `CollectionRow.cardBody` for the rule that keeps them
 * honest.
 *
 * No search box: the mockup draws none, `bookingMine` carries no `q` the way
 * the provider's `bookingForProvider` does, and a client-side filter over a
 * paged list would tell a customer "no matches" about a booking that is
 * merely on the next page. `CollectionCard` draws the control only when it is
 * handed a change handler and a placeholder, so omitting both is the opt-out.
 */
export function BookingsPage() {
  const { t, i18n } = useTranslation("bookings");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { tab?: CustomerBookingTab };
  const tab: CustomerBookingTab = search.tab ?? CUSTOMER_BOOKING_TABS[0];

  const [offset, setOffset] = useState(0);
  /**
   * The rows on screen, which are not the rows the last request returned —
   * and the last answer beside them. Both exactly as
   * `provider/bookings/ui/bookings-page.tsx` keeps them, for the reasons
   * spelled out there: `useQuery` has no data for an offset it has not
   * fetched yet, so reading the count and the "Mais" button straight off it
   * would make them vanish for exactly the length of the request meant to
   * extend the list.
   */
  const [loaded, setLoaded] = useState<BookingDTO[]>([]);
  const [page, setPage] = useState<CustomerBookingPageDTO | null>(null);

  /**
   * Switching tab is a new list, and it is emptied **during the render that
   * switches it** rather than in an effect — passive effects run after the
   * browser paints, so a reset living in one would draw the previous tab's
   * rows under the new tab's heading for a frame first. The app's query
   * client holds data fresh for 30s, so returning to a tab visited seconds
   * ago has `isLoading` false and `data` present on the very render the tab
   * changes in, which makes that frame reachable rather than theoretical.
   * Same mechanism, and same reasoning, as the provider list's `filterKey`.
   */
  const [appliedTab, setAppliedTab] = useState(tab);
  if (appliedTab !== tab) {
    setAppliedTab(tab);
    setOffset(0);
    setLoaded([]);
    setPage(null);
  }

  const query = useMyBookings({ tab, offset });
  // Offset zero is a fresh list and replaces; anything else extends. Ids
  // already on screen are skipped rather than trusted to be disjoint: a
  // booking that changed tab between the two requests shifts every row after
  // it by one, and the same id arriving twice would otherwise render twice.
  useEffect(() => {
    const answer = query.data;
    if (!answer) return;
    setPage(answer);
    setLoaded((current) => {
      if (offset === 0) return answer.items;
      const seen = new Set(current.map((b) => b.id));
      return [...current, ...answer.items.filter((b) => !seen.has(b.id))];
    });
  }, [query.data, offset]);

  // The answer the count, the chips and the pager are read off: the one in
  // hand, falling back to the previous page while the next is in flight, so
  // none of the three blinks out for the length of a request meant to extend
  // the list.
  const data = query.data ?? page;
  // Measured from the moment the page was answered, not from whenever React
  // last re-rendered — see the provider list's own `now`, which this mirrors.
  const now = useMemo(
    () => new Date(query.dataUpdatedAt || Date.now()),
    [query.dataUpdatedAt],
  );

  const setTab = (next: CustomerBookingTab) =>
    void navigate({ to: "/bookings", search: { tab: next } });

  // At offset zero the answer *is* the list, read straight through rather
  // than waited for — the accumulator above only catches up after the paint,
  // so a cached tab would otherwise draw an empty card for one frame. From
  // the second page on, `loaded` is the only thing that remembers the rows
  // above the one the server has just sent.
  //
  // The `DRAFT` filter is belt to `customerWhere`'s braces: the repository
  // already excludes drafts from every tab, and the branch rule is that a
  // draft appears in no tab and on no customer page. Filtering here means a
  // read that ever disagreed would drop a row rather than offer to cancel a
  // checkout the customer does not believe exists.
  const items = (offset === 0 ? (query.data?.items ?? []) : loaded).filter(
    (b) => b.status !== "DRAFT",
  );
  // The whole row rather than an id: the dialog needs the slot's date and
  // the provider's name, and `items` is already the answer this render has
  // — a second lookup by id would only reintroduce the chance of it missing.
  const [cancelling, setCancelling] = useState<BookingDTO | null>(null);
  const [paying, setPaying] = useState<BookingDTO | null>(null);
  // The phone `PayDialog` shows masked in its waiting state, and the reason
  // it comes from here rather than from the row: `bookingMine` deliberately
  // carries no phone field (a booking's own snapshot has no reason to hold
  // one), so the one place this page has it is the signed-in user's own
  // profile.
  const { data: currentUser } = useCurrentUser();

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
          loading={query.isLoading && offset === 0}
          // All three facts are marked `hideOnCard` because all three are in
          // `cardBody` below, arranged rather than labelled — the rule
          // `CollectionRow.cardBody` states for anyone using the slot. The
          // table is unchanged and still reads them off `cells`.
          columns={[
            { key: "service", label: t("col.service"), className: "pl-5" },
            {
              key: "when",
              label: t("col.when"),
              skeletonWidth: "w-28",
              hideOnCard: true,
            },
            {
              key: "status",
              label: t("col.status"),
              skeletonWidth: "w-24",
              skeletonShape: "badge",
              hideOnCard: true,
            },
            {
              key: "price",
              label: t("col.price"),
              align: "right",
              skeletonWidth: "w-20",
              hideOnCard: true,
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
          // Unreachable: with no search box and no filter button there is
          // nothing that could hide a row. The prop is still required, and
          // reusing the empty state's own body is truer than inventing a
          // sentence for a state this page cannot enter.
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
                <div className="flex items-start gap-3">
                  {/* `BrandImage`, not an `<img>`: a booking's service photo
                      is missing more often than not, and every dead URL on
                      dev is one of these. The mark on the soft ground is the
                      app's single treatment for that — see its own comment.
                      Empty `alt`, because the title is right beside it. */}
                  <span className="h-12 w-12 shrink-0 overflow-hidden rounded-[var(--radius-card-sm)]">
                    <BrandImage
                      src={b.serviceImageUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </span>
                  <div className="min-w-0">
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
                    {/* The appointment, on the narrow screen only. The table
                        has a "Quando" column two cells to the right and this
                        would be the same fact printed twice on a laptop;
                        below `md` that column is hidden, and a date belongs
                        with the name it qualifies rather than under a
                        heading of its own. */}
                    <p className="type-caption mt-0.5 tabular-nums text-[var(--color-muted-foreground)] md:hidden">
                      {slot.date} · {slot.start} ·{" "}
                      {t("minutes", { count: b.durationMinutes })}
                    </p>
                  </div>
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
                // The exact amount, matching the detail page's own money
                // block and the pay dialog: a row is not a browse card's
                // approximate headline, it is this booking's own total, and a
                // row reading "1 801 MZN" over a dialog asking for 1 800,50
                // is the list disagreeing with the debit.
                price: (
                  <span className="tabular-nums">
                    {formatAmount(b.priceMinor, b.currency, locale)}
                  </span>
                ),
              },
              // The same three facts as the cells above, arranged for one
              // column instead of labelled in a list: the pill and the total
              // share a line because they are what the eye goes to, and
              // "Estado" and "Valor" written beside them are two words of
              // chrome on the narrowest screen the app has.
              cardBody: (
                <div className="grid gap-3">
                  <div className="flex items-start justify-between gap-3">
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
                    {/* The same exact amount the cell carries, at the size the
                        detail page gives the total — never the rounded
                        headline. See the `price` cell below. */}
                    <span className="type-h3 shrink-0 font-semibold tabular-nums">
                      {formatAmount(b.priceMinor, b.currency, locale)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    {/* The provider is one press away from every row, whatever
                        the booking's status: a customer with a question about
                        a job that is over has the same right to ask it as one
                        waiting to be paid for. */}
                    <MessageProviderButton
                      providerId={b.providerId}
                      compact
                      label={t("message")}
                    />
                    {/* The row's title is a link too, but a line of text is a
                        poor target for a thumb. This is the one the card is
                        actually tapped by. */}
                    <Link
                      to="/bookings/$bookingId"
                      params={{ bookingId: b.id }}
                      className="type-caption inline-flex items-center gap-1 font-semibold text-[var(--color-primary)] hover:underline"
                    >
                      {t("viewDetail")}
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  </div>
                </div>
              ),
              // One action, never two: a confirmed booking has nothing to do
              // here at all, and a `PENDING_PAYMENT` row shows only Pagar —
              // both buttons together belong to the detail page, not this
              // row (see the comment on `showPay`/`showCancel` above).
              actions: showPay ? (
                <Button type="button" size="sm" onClick={() => setPaying(b)}>
                  {t("pay")}
                </Button>
              ) : showCancel ? (
                // A `<button>`, not a link: it opens a dialog rather than
                // navigating. Styled quietly, as the mockup draws it — this
                // is not the page's primary action.
                <button
                  type="button"
                  onClick={() => setCancelling(b)}
                  className="type-caption font-medium text-[var(--color-muted-foreground)] hover:underline disabled:pointer-events-none disabled:opacity-50"
                >
                  {t("cancel")}
                </button>
              ) : undefined,
            };
          })}
        />
      </div>

      {/* No "anterior": nothing was taken away to go back to. The card's own
          header carries the count, and it is honest now that `shown` grows
          with the list instead of restarting at twenty on every page. */}
      {data && data.nextOffset !== null && (
        <div className="mt-4 flex justify-end">
          <Button
            type="button"
            variant="outline"
            disabled={query.isFetching}
            onClick={() => setOffset(data.nextOffset ?? offset + CUSTOMER_BOOKINGS_PAGE_SIZE)}
          >
            {t("loadMore")}
          </Button>
        </div>
      )}

      {cancelling && (
        <CancelDialog booking={cancelling} onClose={() => setCancelling(null)} />
      )}
      {paying && (
        <PayDialog
          booking={paying}
          phone={currentUser?.phoneNumber ?? null}
          onClose={() => setPaying(null)}
        />
      )}
    </div>
  );
}
