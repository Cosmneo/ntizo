import { useTranslation } from "react-i18next";
import { ArrowDownLeft, ArrowUpRight, Wallet as WalletIcon } from "lucide-react";
import { Button, Skeleton } from "@ntizo/frontend-ui";
import type { WalletEntryDTO } from "@ntizo/shared/read-models";
import { useWallet } from "../viewmodel/use-wallet";
import {
  formatMoney,
  movedNothing,
  movementMinor,
  movementTone,
} from "../domain/money";

/**
 * A workspace's money: the two balances, and the entries behind them.
 *
 * One component for both zones. What the provider sees on their own wallet and
 * what an administrator sees looking at theirs is the same thing — the money
 * does not change depending on who reads it — and building two would be two
 * places for the same currency formatting to drift.
 *
 * Two balances rather than one total, because they answer different questions.
 * "Available" is what can be withdrawn today. "Pending" is earned and held —
 * a completed booking that has not passed its hold period. Adding them would
 * produce a number that is true of nothing: not what is owed, not what can be
 * taken out.
 */
export function WalletPanel({
  providerId,
  /** Fewer rows and no heading, for a detail page that has its own. */
  compact = false,
  /**
   * Which half to draw.
   *
   * The balance and the ledger answer different questions with different
   * urgencies, and on the administrator's file they belong in different
   * places. How much a business holds is a fact about it and sits with its
   * name; why it holds that is a list, and a list between a reviewer and the
   * decision they came to make is a list in the way.
   */
  show = "all",
}: {
  providerId: string | undefined;
  compact?: boolean;
  show?: "all" | "balances" | "history";
}) {
  const { t, i18n } = useTranslation("provider");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const query = useWallet(providerId);

  const first = query.data?.pages[0];
  const wallet = first?.wallet;
  const entries = query.data?.pages.flatMap((p) => p.entries) ?? [];
  const money = (minor: number) =>
    formatMoney(minor, wallet?.currency ?? "MZN", locale);

  return (
    <div className="grid gap-4">
      {show !== "history" && (
      <div className="grid gap-4 sm:grid-cols-2">
        <BalanceCard
          label={t("walletAvailable")}
          hint={t("walletAvailableHint")}
          loading={query.isLoading}
          value={wallet ? money(wallet.availableMinor) : null}
          emphasis
        />
        <BalanceCard
          label={t("walletPending")}
          hint={t("walletPendingHint")}
          loading={query.isLoading}
          value={wallet ? money(wallet.pendingMinor) : null}
        />
      </div>
      )}

      {show !== "balances" && (
      <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)]">
        {!compact && (
          <div className="px-4 py-4 sm:px-5">
            <p className="type-caption font-bold tracking-[0.14em] text-[var(--color-muted-foreground)] uppercase">
              {t("walletHistory")}
            </p>
            <p className="type-body mt-0.5 text-[var(--color-muted-foreground)]">
              {t("walletHistoryHint")}
            </p>
          </div>
        )}

        {query.isLoading ? (
          <ul className="grid list-none gap-3 p-4">
            {Array.from({ length: compact ? 3 : 5 }, (_, i) => (
              <li key={i} className="flex items-center justify-between gap-4">
                <div className="grid gap-1.5">
                  <Skeleton className="h-[19px] w-44" />
                  <Skeleton className="h-[17px] w-28" />
                </div>
                <Skeleton className="h-[19px] w-24" />
              </li>
            ))}
          </ul>
        ) : entries.length === 0 ? (
          // Said plainly rather than dressed up. Nothing writes ledger entries
          // yet — payments are not built — and an empty state that implied the
          // provider had simply earned nothing would be a different claim.
          <div className="grid place-items-center gap-2 px-5 py-12 text-center">
            <WalletIcon className="h-6 w-6 text-[var(--color-muted-foreground)]" />
            <p className="type-body text-[var(--color-muted-foreground)]">
              {t("walletEmpty")}
            </p>
          </div>
        ) : (
          <ul className="grid list-none gap-0 p-0">
            {entries.map((entry) => (
              <EntryRow
                key={entry.id}
                entry={entry}
                locale={locale}
                money={money}
                typeLabel={t(`walletType.${entry.type}`, {
                  defaultValue: entry.type,
                })}
              />
            ))}
          </ul>
        )}

        {query.hasNextPage && !compact && (
          <div className="flex justify-center border-t border-[var(--color-border)] p-4">
            <Button
              type="button"
              variant="outline"
              disabled={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
            >
              {t("walletLoadMore")}
            </Button>
          </div>
        )}
      </div>
      )}
    </div>
  );
}

function BalanceCard({
  label,
  hint,
  value,
  loading,
  emphasis,
}: {
  label: string;
  hint: string;
  value: string | null;
  loading: boolean;
  emphasis?: boolean;
}) {
  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] p-5">
      <p className="type-caption font-bold tracking-[0.14em] text-[var(--color-muted-foreground)] uppercase">
        {label}
      </p>
      {loading ? (
        <Skeleton className="mt-2 h-[34px] w-36" />
      ) : (
        <p
          className={
            emphasis
              ? "mt-1 text-3xl font-semibold tabular-nums"
              : "mt-1 text-3xl font-semibold tabular-nums text-[var(--color-muted-foreground)]"
          }
        >
          {value}
        </p>
      )}
      <p className="type-caption mt-1 text-[var(--color-muted-foreground)]">
        {hint}
      </p>
    </div>
  );
}

/** One line of the ledger: what it was, when, and what it moved. */
function EntryRow({
  entry,
  locale,
  money,
  typeLabel,
}: {
  entry: WalletEntryDTO;
  locale: string;
  money: (minor: number) => string;
  typeLabel: string;
}) {
  const tone = movementTone(entry);
  const when = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(entry.createdAt));

  return (
    <li className="flex items-center justify-between gap-4 border-t border-[var(--color-border)] px-4 py-3.5 first:border-t-0 sm:px-5">
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={
            tone === "up"
              ? "grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,var(--color-success)_14%,transparent)] text-[var(--color-success)]"
              : tone === "down"
                ? "grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,var(--color-destructive)_14%,transparent)] text-[var(--color-destructive)]"
                : "grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--color-muted)] text-[var(--color-muted-foreground)]"
          }
        >
          {tone === "down" ? (
            <ArrowUpRight className="h-4 w-4" />
          ) : (
            <ArrowDownLeft className="h-4 w-4" />
          )}
        </span>
        <div className="min-w-0">
          <p className="type-body-medium truncate font-semibold">
            {entry.description?.trim() || typeLabel}
          </p>
          <p className="type-caption truncate text-[var(--color-muted-foreground)]">
            {when}
          </p>
        </div>
      </div>
      <div className="shrink-0 text-right">
        {/* An entry that moved nothing shows its amount without a sign. Cash
            settled outside the platform is the case: "+0,00 MT" beside a
            1 500 MT job reads as a bug, and the amount alone is what
            happened. */}
        <p className="type-body-medium font-semibold tabular-nums">
          {movedNothing(entry)
            ? money(entry.amountMinor)
            : `${movementMinor(entry) > 0 ? "+" : "−"}${money(Math.abs(movementMinor(entry)))}`}
        </p>
        <p className="type-caption tabular-nums text-[var(--color-muted-foreground)]">
          {money(entry.balanceAfterMinor)}
        </p>
      </div>
    </li>
  );
}
