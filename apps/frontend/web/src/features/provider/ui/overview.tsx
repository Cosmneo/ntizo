import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { CollectionCard } from "@/shared/components/collection-card";
import { usePageAction, usePageHeader } from "@/shared/lib/page-header";
import { useProviderThreads } from "@/features/messaging/viewmodel/use-provider-threads";
import { useServices } from "@/features/provider/services/viewmodel/use-services";
import { formatMoney } from "@/features/wallet/domain/money";
import { bookingColumns, bookingRow } from "../bookings/ui/booking-row";
import {
  useProviderStats,
  useRecentBookings,
} from "../bookings/viewmodel/use-provider-bookings";
import { greetingKey } from "../domain/greeting";
import { useActiveProvider } from "../viewmodel/use-active-provider";
import { useProviderRating } from "../viewmodel/use-provider-rating";
import { ActivityChart } from "./overview-chart";
import { StatCard } from "./overview-cards";

/** A card's way out, at caption size: small enough not to compete with the number. */
const LINK = "type-caption font-semibold text-[var(--color-primary)] hover:underline";

/**
 * The workspace at a glance: what needs an answer, what is coming, what the
 * month earned, and what people think. Four readings, one of which is a task
 * — so exactly one card carries a verb. The week and the revenue are things
 * to know, not things to do, and an action on either would leave the reader
 * with four calls to action and no way to tell which one is the work.
 *
 * Every number here is read, never derived: the counts, the money and the
 * thirty days all come from one `bookingStatsForProvider` call, so the
 * sidebar's badge and this page's first card cannot disagree.
 */
export function OverviewPage() {
  const { t, i18n } = useTranslation("provider");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const { activeProvider } = useActiveProvider();
  const providerId = activeProvider?.id ?? "";
  const slug = activeProvider?.slug ?? "";

  const stats = useProviderStats(providerId);
  const recent = useRecentBookings(providerId);
  const services = useServices(providerId);
  const rating = useProviderRating(providerId);
  const threads = useProviderThreads(providerId);

  /**
   * The moment the numbers were answered, not whenever React last rendered.
   * Every countdown in the recent list then measures from one instant, and a
   * re-render for an unrelated reason cannot move the clock a minute while
   * nothing about the data changed — the same bargain the bookings list makes.
   */
  const now = useMemo(
    () => new Date(stats.dataUpdatedAt || Date.now()),
    [stats.dataUpdatedAt],
  );

  usePageHeader(
    t(`overview.greeting.${greetingKey(now)}`, { name: activeProvider?.name ?? "" }),
    t("overview.subtitle"),
  );
  usePageAction(
    slug ? (
      // A styled `Link`, not a `Button asChild`: the kit's Button is a plain
      // forwardRef over `buttonVariants` with no Slot, so `asChild` would
      // render a button with a link inside it.
      <Link
        to="/provider/$slug/bookings"
        params={{ slug }}
        className="type-body-medium inline-flex h-10 items-center rounded-[var(--radius-field)] border border-[var(--color-input)] px-4 font-semibold hover:bg-[var(--color-muted)]"
      >
        {t("overview.seeBookings")}
      </Link>
    ) : null,
    [slug, t],
  );

  // A person with no workspace gets the message, not a grid of zeros.
  if (!activeProvider) return <p className="type-body">{t("noActiveProvider")}</p>;

  const s = stats.data;
  const published = (services.data ?? []).filter((x) => x.status === "published").length;
  const drafts = (services.data ?? []).filter((x) => x.status === "draft").length;
  const unread = threads.threads.reduce((n, thread) => n + thread.unreadCount, 0);
  const items = recent.data?.items ?? [];
  const money = (minor: number) => formatMoney(minor, s?.currency ?? "MZN", locale);

  return (
    <div className="mx-auto grid max-w-6xl gap-4">
      {stats.isError && (
        <p role="alert" className="type-body text-[var(--color-destructive)]">
          {t("overview.loadError")}{" "}
          <button
            type="button"
            className="underline"
            onClick={() => void stats.refetch()}
          >
            {t("overview.retry")}
          </button>
        </p>
      )}

      {/* `xl:`, not `lg:`. Four columns at 1024px is where this grid was at
          its narrowest of all: the sidebar is showing by then, so each card
          gets a 134px content box — tighter than a 390px phone — while the
          revenue card is drawing its money at the full 28px. Holding two
          columns until 1280px gives those cards 318px there instead, and the
          four-up step lands where the track is 198px. */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard
          label={t("overview.awaitingTitle")}
          value={s?.awaitingResponse ?? 0}
          loading={stats.isLoading}
          hint={s && s.awaitingResponse === 0 ? t("overview.awaitingNone") : undefined}
          action={
            s && s.awaitingResponse > 0 ? (
              <Link
                to="/provider/$slug/bookings"
                params={{ slug }}
                search={{ tab: "requests" }}
                className={LINK}
              >
                {t("overview.awaitingAction")}
              </Link>
            ) : undefined
          }
        />
        <StatCard
          label={t("overview.weekTitle")}
          value={s?.upcomingWeek ?? 0}
          loading={stats.isLoading}
          hint={t("overview.todayCount", { count: s?.upcomingToday ?? 0 })}
        />
        <StatCard
          label={t("overview.revenueTitle")}
          value={money(s?.revenueLast30Minor ?? 0)}
          loading={stats.isLoading}
          hint={
            <>
              {t("overview.pipeline", { amount: money(s?.pipelineMinor ?? 0) })}
              {/* The figure above is the payout, not the listed price. Saying
                  so is the difference between a number the provider can plan
                  against and one they will query.

                  Except when nothing has been completed: the revenue sums only
                  `COMPLETED` bookings, nothing writes that status yet, and a
                  commission note over a zero explains a deduction that has not
                  happened. Controller ruling R10 — the number stays what it
                  is, the sentence under it says why it is zero. The pipeline
                  line above is unchanged either way; it is the one figure a
                  provider with a full week still has. */}
              <span className="block">
                {s && s.completedLast30 === 0
                  ? t("overview.nothingCompleted")
                  : t("overview.revenueHint")}
              </span>
            </>
          }
        />
        <StatCard
          label={t("overview.ratingTitle")}
          value={
            rating.data?.average != null
              ? new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(
                  rating.data.average,
                )
              : "—"
          }
          loading={rating.isLoading}
          hint={
            rating.data?.count
              ? t("overview.ratingCount", { count: rating.data.count })
              : t("overview.ratingNone")
          }
          action={
            rating.data?.count ? (
              // The public page, because that is where the words are — this
              // is where they are read, not a second thing to answer.
              <Link to="/providers/$slug" params={{ slug }} className={LINK}>
                {t("overview.seeReviews")}
              </Link>
            ) : undefined
          }
        />
      </div>

      <ActivityChart days={s?.perDay ?? []} locale={locale} />

      <CollectionCard
        title={t("overview.recentTitle")}
        shown={items.length}
        total={recent.data?.total ?? items.length}
        loading={recent.isLoading}
        // The list's columns without the price: eight rows here are "who is
        // coming", and the money has its own card two rows above.
        columns={bookingColumns(t).filter((c) => c.key !== "price")}
        rows={items.map((b) => bookingRow(b, { slug, locale, now, t }))}
        emptyTitle={t("overview.recentEmptyTitle")}
        emptyText={t("overview.recentEmpty")}
        noMatchesTitle={t("overview.recentEmptyTitle")}
        noMatchesText={t("overview.recentEmpty")}
        // Nothing narrows this card — it is the newest eight, always.
        filtered={false}
        action={
          <Link to="/provider/$slug/bookings" params={{ slug }} className={LINK}>
            {t("overview.recentAll")}
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          label={t("overview.servicesTitle")}
          value={published}
          loading={services.isLoading}
          hint={
            published + drafts === 0 ? (
              t("overview.servicesNone")
            ) : (
              <>
                <span>{t("overview.servicesPublished", { count: published })}</span>
                {" · "}
                <span>{t("overview.servicesDraft", { count: drafts })}</span>
              </>
            )
          }
          action={
            <Link to="/provider/$slug/services" params={{ slug }} className={LINK}>
              {t("overview.servicesAction")}
            </Link>
          }
        />
        <StatCard
          label={t("overview.messagesTitle")}
          value={unread}
          loading={threads.loading}
          hint={
            unread === 0
              ? t("overview.messagesNone")
              : t("overview.messagesUnread", { count: unread })
          }
          action={
            <Link to="/provider/$slug/messages" params={{ slug }} className={LINK}>
              {t("overview.messagesAction")}
            </Link>
          }
        />
      </div>
    </div>
  );
}
