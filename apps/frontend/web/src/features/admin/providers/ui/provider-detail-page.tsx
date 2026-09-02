import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { BrandImage } from "@/shared/components/brand-image";
import { Link, useParams } from "@tanstack/react-router";
import { ArrowLeft, Loader2 } from "lucide-react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
  Button,
  Input,
  Skeleton,
} from "@ntizo/frontend-ui";
import { ProviderStatus } from "@ntizo/shared";
import { WalletPanel } from "@/features/wallet/ui/wallet-panel";
import { DocumentsSection } from "./documents-section";
import { initialsFrom } from "@/shared/lib/initials";
import { usePageHeader } from "@/shared/lib/page-header";
import {
  useAdminProviderDetail,
  useDecideProviderStatus,
  useSetProviderCommission,
} from "../viewmodel/use-admin-providers";
import {
  type AdminProviderInvite,
  type AdminProviderMember,
} from "../domain/types";
import { formatCommission } from "@/shared/domain/commission-format";

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
                {/* The logo, not a monogram. It was already in the read and
                    the screen drew initials over it — an administrator looking
                    at a business should see the mark its customers see. The
                    monogram stays as the fallback for a business with none. */}
                <Avatar className="h-14 w-14 shrink-0">
                  {detail.logoUrl && (
                    <AvatarImage src={detail.logoUrl} alt="" />
                  )}
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
              <Pair
                label={t("providerDetailAddress")}
                value={
                  [
                    detail.addressStreet,
                    detail.addressDistrict,
                    detail.city,
                    detail.addressPostalCode,
                    detail.country,
                  ]
                    .filter(Boolean)
                    .join(", ") || null
                }
              />
              <Pair label={t("providerDetailType")} value={t(`providerType.${detail.type}`, { defaultValue: detail.type })} />
              {/* Shown because the provider's own settings show it, and
                  because it is what anybody asking about this business over
                  support will quote. */}
              <Pair label={t("providerDetailId")} value={detail.id} mono />
              {/* In full, not masked. The person reading this is the one who
                  has to send the money, and half an account number is no use
                  to them — the protection is that this read is refused to
                  everybody else, not that the number is hidden from the one
                  person who needs it. */}
              <Pair
                label={t("providerDetailPayout")}
                value={
                  detail.payoutType
                    ? `${t(`payoutMethod.${detail.payoutType}`, { defaultValue: detail.payoutType })} · ${detail.payoutIdentifier ?? "—"}`
                    : null
                }
              />
            </dl>

            {detail.description?.trim() && (
              <div className="mt-5 border-t border-[var(--color-border)] pt-5">
                <p className="type-caption text-[var(--color-muted-foreground)]">
                  {t("providerDetailDescription")}
                </p>
                {/* `whitespace-pre-line` so the paragraphs the provider typed
                    survive. Collapsed into one block it reads as a different
                    text from the one they wrote. */}
                <p className="type-body mt-1 whitespace-pre-line">
                  {detail.description}
                </p>
              </div>
            )}

            {detail.photoUrls.length > 0 && (
              <div className="mt-5 border-t border-[var(--color-border)] pt-5">
                <p className="type-caption text-[var(--color-muted-foreground)]">
                  {t("providerDetailPhotos")}
                </p>
                <div className="mt-2 flex flex-wrap gap-3">
                  {detail.photoUrls.map((url) => (
                    <a key={url} href={url} target="_blank" rel="noreferrer">
                      <BrandImage
                        src={url}
                        alt=""
                        className="h-24 w-32 rounded-[var(--radius-card-sm)] object-cover"
                      />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {/* ── The money, at a glance ───────────────────────────────────────── */}
      {/* Second, right under the name. How much a business is holding is a
          fact about it, like its status and its owner — the first thing worth
          knowing about an active one, and the thing that decides whether
          suspending it is a small act or an expensive one.

          Only the two numbers here. The ledger stays below the documents: a
          reviewer opening a pending application came for the papers and the
          decision, and a list of movements between them and that work is a
          list in the way. */}
      <WalletPanel providerId={providerId} show="balances" />

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

      <TeamSection
        members={detail?.members ?? []}
        invites={detail?.invites ?? []}
        loading={query.isLoading}
      />

      <DocumentsSection
        providerId={providerId}
        documents={detail?.documents ?? []}
        reverificationRequestedAt={detail?.reverificationRequestedAt ?? null}
        loading={query.isLoading}
      />

      {/* ── The money ────────────────────────────────────────────────────── */}
      <section className="grid gap-3">
        <div>
          <p className="type-caption font-bold tracking-[0.14em] text-[var(--color-muted-foreground)] uppercase">
            {t("providerDetailMovements")}
          </p>
          <p className="type-body mt-0.5 text-[var(--color-muted-foreground)]">
            {t("providerDetailMovementsHint")}
          </p>
        </div>
        <WalletPanel providerId={providerId} show="history" compact />
      </section>
    </div>
  );
}

function Pair({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
}) {
  return (
    <div className="grid gap-0.5">
      <dt className="type-caption text-[var(--color-muted-foreground)]">
        {label}
      </dt>
      <dd
        className={
          mono ? "type-caption m-0 truncate font-mono" : "type-body m-0 truncate"
        }
      >
        {value?.trim() || "—"}
      </dd>
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

/**
 * Who can act for this business.
 *
 * Pending invitations sit beside the members on purpose: an invitation is
 * somebody who is *about* to have access, and a reviewer reading only the
 * accepted list is reading half the answer to "who is this business".
 */
function TeamSection({
  members,
  invites,
  loading,
}: {
  members: readonly AdminProviderMember[];
  invites: readonly AdminProviderInvite[];
  loading: boolean;
}) {
  const { t, i18n } = useTranslation("admin");
  // Roles and invitation states are named in the `provider` namespace, where
  // the workspace's own people list already reads them. Read from there rather
  // than copied across: a copy is one more place for "Owner" to change on one
  // screen and not the other. Getting this wrong is silent — i18next renders
  // the key.
  const { t: tp } = useTranslation("provider");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const date = (iso: string) =>
    new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(iso));

  return (
    <section className="rounded-[var(--radius-card)] border border-[var(--color-border)]">
      <div className="px-5 py-4">
        <p className="type-caption font-bold tracking-[0.14em] text-[var(--color-muted-foreground)] uppercase">
          {t("providerDetailTeam")}
        </p>
        <p className="type-body mt-0.5 text-[var(--color-muted-foreground)]">
          {t("providerDetailTeamHint")}
        </p>
      </div>

      {loading ? (
        <p className="type-body border-t border-[var(--color-border)] px-5 py-8 text-center text-[var(--color-muted-foreground)]">
          {t("providerDetailDocumentsLoading")}
        </p>
      ) : (
        <ul className="grid list-none gap-0 p-0">
          {members.map((m) => (
            <li
              key={m.userId}
              className="flex items-center justify-between gap-4 border-t border-[var(--color-border)] px-5 py-3.5"
            >
              <div className="flex min-w-0 items-center gap-3">
                <Avatar className="h-9 w-9 shrink-0">
                  <AvatarFallback className="text-xs">
                    {initialsFrom(m.name ?? m.email ?? "?")}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="type-body-medium truncate font-semibold">
                    {m.name ?? m.email ?? "—"}
                  </p>
                  <p className="type-caption truncate text-[var(--color-muted-foreground)]">
                    {m.name ? m.email : t("providerDetailJoined", { date: date(m.joinedAt) })}
                  </p>
                </div>
              </div>
              <Badge tone={m.role === "owner" ? "success" : "info"}>
                {tp(`peopleRoles.${m.role}`, { defaultValue: m.role })}
              </Badge>
            </li>
          ))}

          {invites.map((i) => (
            <li
              key={i.id}
              className="flex items-center justify-between gap-4 border-t border-[var(--color-border)] px-5 py-3.5"
            >
              <div className="min-w-0">
                <p className="type-body-medium truncate font-semibold">
                  {i.email}
                </p>
                <p className="type-caption truncate text-[var(--color-muted-foreground)]">
                  {t("providerDetailInviteExpires", { date: date(i.expiresAt) })}
                </p>
              </div>
              <Badge tone="warning">
                {/* The table stores `pending`; the people list calls that state
                    `invited`, which is the word a reader understands — an
                    invitation is not pending in the way a document is. Mapped
                    rather than adding a second name for the same state. */}
                {tp(`peopleStatus.${i.status === "pending" ? "invited" : i.status}`, {
                  defaultValue: i.status,
                })}
              </Badge>
            </li>
          ))}

          {members.length === 0 && invites.length === 0 && (
            <li className="type-body border-t border-[var(--color-border)] px-5 py-8 text-center text-[var(--color-muted-foreground)]">
              {t("providerDetailNoTeam")}
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
