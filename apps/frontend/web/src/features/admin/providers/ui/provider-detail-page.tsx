import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "@tanstack/react-router";
import { ArrowLeft, Loader2 } from "lucide-react";
import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  Input,
  Skeleton,
} from "@ntizo/frontend-ui";
import { ProviderStatus } from "@ntizo/shared";
import { WalletPanel } from "@/features/wallet/ui/wallet-panel";
import { initialsFrom } from "@/shared/lib/initials";
import { usePageHeader } from "@/shared/lib/page-header";
import {
  useAdminProviderDetail,
  useDecideProviderStatus,
  useSetProviderCommission,
} from "../viewmodel/use-admin-providers";
import { formatCommission } from "../domain/types";

const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "info"> = {
  [ProviderStatus.Active]: "success",
  [ProviderStatus.Pending]: "warning",
  [ProviderStatus.Rejected]: "danger",
  [ProviderStatus.Suspended]: "danger",
  [ProviderStatus.Archived]: "info",
};

/**
 * One business, and the two decisions an administrator makes about it.
 *
 * The decisions are deliberately separate: approving a business and setting
 * what it is charged have different consequences, and one Save covering both
 * would let a slip in the commission ride along with an approval nobody meant
 * to revisit.
 *
 * Which status buttons appear comes from the server, not from a list written
 * here. The aggregate owns which moves are legal, and a button the server then
 * refuses is worse than no button.
 */
export function AdminProviderDetailPage() {
  const { t, i18n } = useTranslation("admin");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const { providerId } = useParams({ strict: false }) as { providerId: string };

  const query = useAdminProviderDetail(providerId);
  const decide = useDecideProviderStatus(providerId);
  const commission = useSetProviderCommission(providerId);
  const detail = query.data;

  usePageHeader(detail?.name ?? t("providerDetailTitle"), detail?.slug);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <Link
        to="/admin/providers"
        className="type-body inline-flex items-center gap-1.5 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("providersTitle")}
      </Link>

      {query.error && (
        <p className="type-body text-[var(--color-destructive)]">
          {t("providerDetailError")}
        </p>
      )}

      {/* ── Who this is ──────────────────────────────────────────────────── */}
      <section className="rounded-[var(--radius-card)] border border-[var(--color-border)] p-5">
        {query.isLoading || !detail ? (
          <div className="flex items-center gap-4">
            <Skeleton className="h-14 w-14 shrink-0 rounded-full" />
            <div className="grid gap-2">
              <Skeleton className="h-[24px] w-56" />
              <Skeleton className="h-[19px] w-40" />
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex min-w-0 items-center gap-4">
                <Avatar className="h-14 w-14 shrink-0">
                  <AvatarFallback>{initialsFrom(detail.name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <h2 className="type-h3 truncate font-semibold">
                    {detail.name}
                  </h2>
                  <p className="type-body truncate text-[var(--color-muted-foreground)]">
                    {[detail.city, detail.country].filter(Boolean).join(", ") ||
                      detail.slug}
                  </p>
                </div>
              </div>
              <Badge tone={STATUS_TONE[detail.status] ?? "info"}>
                {t(`providerStatus.${detail.status}`)}
              </Badge>
            </div>

            <dl className="mt-5 grid gap-x-8 gap-y-3 border-t border-[var(--color-border)] pt-5 sm:grid-cols-2">
              <Pair label={t("providersOwner")} value={detail.ownerName} />
              <Pair label={t("providerDetailEmail")} value={detail.ownerEmail} />
              <Pair label={t("providerDetailPhone")} value={detail.ownerPhone} />
              <Pair
                label={t("providerDetailMembers")}
                value={String(detail.memberCount)}
              />
              <Pair
                label={t("providersApplied")}
                value={new Intl.DateTimeFormat(locale, {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                }).format(new Date(detail.createdAt))}
              />
              <Pair
                label={t("providersCommission")}
                value={formatCommission(detail.commissionBps, locale)}
              />
            </dl>
          </>
        )}
      </section>

      {/* ── What can be done ─────────────────────────────────────────────── */}
      <section className="rounded-[var(--radius-card)] border border-[var(--color-border)] p-5">
        <p className="type-caption font-bold tracking-[0.14em] text-[var(--color-muted-foreground)] uppercase">
          {t("providerDetailDecision")}
        </p>
        <p className="type-body mt-0.5 text-[var(--color-muted-foreground)]">
          {t("providerDetailDecisionHint")}
        </p>

        {decide.error && (
          <p className="type-body mt-3 text-[var(--color-destructive)]">
            {t(`providerActionError.${(decide.error as { code?: string }).code}`, {
              defaultValue: t("providerActionFailed"),
            })}
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2.5">
          {query.isLoading || !detail ? (
            <>
              <Skeleton className="h-11 w-32 rounded-[var(--radius-field)]" />
              <Skeleton className="h-11 w-32 rounded-[var(--radius-field)]" />
            </>
          ) : detail.allowedTransitions.length === 0 ? (
            // Archived is terminal. Saying so beats an empty row that reads as
            // a screen that failed to load its buttons.
            <p className="type-body text-[var(--color-muted-foreground)]">
              {t("providerDetailNoActions")}
            </p>
          ) : (
            detail.allowedTransitions.map((status) => (
              <Button
                key={status}
                type="button"
                variant={
                  status === ProviderStatus.Active ? "default" : "outline"
                }
                disabled={decide.isPending}
                onClick={() => decide.mutate(status)}
              >
                {decide.isPending && decide.variables === status && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                {t(`providerAction.${status}`)}
              </Button>
            ))
          )}
        </div>
      </section>

      {/* ── The commission ───────────────────────────────────────────────── */}
      <section className="rounded-[var(--radius-card)] border border-[var(--color-border)] p-5">
        <p className="type-caption font-bold tracking-[0.14em] text-[var(--color-muted-foreground)] uppercase">
          {t("providersCommission")}
        </p>
        <p className="type-body mt-0.5 text-[var(--color-muted-foreground)]">
          {t("providerDetailCommissionHint")}
        </p>
        {/* No `key` here. Remounting on every change of the saved value did
            the same job as the effect inside, and did it worse: a background
            refetch landing while somebody was typing threw away what they had
            written. One mechanism, and it only fires when the server's answer
            actually changes. */}
        <CommissionForm
          currentBps={detail?.commissionBps ?? null}
          pending={commission.isPending}
          error={commission.error as { code?: string } | null}
          onSave={(bps) => commission.mutate(bps)}
        />
      </section>

      {/* ── The money ────────────────────────────────────────────────────── */}
      <section className="grid gap-3">
        <div>
          <p className="type-caption font-bold tracking-[0.14em] text-[var(--color-muted-foreground)] uppercase">
            {t("providerDetailWallet")}
          </p>
          <p className="type-body mt-0.5 text-[var(--color-muted-foreground)]">
            {t("providerDetailWalletHint")}
          </p>
        </div>
        <WalletPanel providerId={providerId} compact />
      </section>
    </div>
  );
}

function Pair({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="grid gap-0.5">
      <dt className="type-caption text-[var(--color-muted-foreground)]">
        {label}
      </dt>
      <dd className="type-body m-0 truncate">{value?.trim() || "—"}</dd>
    </div>
  );
}

/**
 * The commission, typed as a percentage and stored as basis points.
 *
 * A percentage because that is what the number is called in every conversation
 * about it; basis points on the wire because 7.5% is 750 exactly and 0.075 is
 * not. The conversion happens once, here.
 */
function CommissionForm({
  currentBps,
  pending,
  error,
  onSave,
}: {
  currentBps: number | null;
  pending: boolean;
  error: { code?: string } | null;
  onSave: (bps: number) => void;
}) {
  const { t } = useTranslation("admin");
  const [value, setValue] = useState(
    currentBps === null ? "" : String(currentBps / 100),
  );

  useEffect(() => {
    if (currentBps !== null) setValue(String(currentBps / 100));
  }, [currentBps]);

  const parsed = Number(value.replace(",", "."));
  const valid = Number.isFinite(parsed) && parsed >= 0 && parsed <= 100;
  // Rounded, because 7.55% is 755 basis points and 7.555% is not expressible.
  const bps = Math.round(parsed * 100);
  const changed = currentBps !== null && bps !== currentBps;

  return (
    <div className="mt-4 grid gap-2">
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative w-32">
          <Input
            value={value}
            inputMode="decimal"
            onChange={(e) => setValue(e.target.value)}
            aria-label={t("providersCommission")}
            className="pr-8"
          />
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[var(--color-muted-foreground)]">
            %
          </span>
        </div>
        <Button
          type="button"
          disabled={!valid || !changed || pending}
          onClick={() => onSave(bps)}
        >
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("providerDetailCommissionSave")}
        </Button>
      </div>
      {!valid && value.trim() !== "" && (
        <p className="type-caption text-[var(--color-destructive)]">
          {t("providerDetailCommissionRange")}
        </p>
      )}
      {error && (
        <p className="type-body text-[var(--color-destructive)]">
          {t(`providerActionError.${error.code}`, {
            defaultValue: t("providerActionFailed"),
          })}
        </p>
      )}
    </div>
  );
}
