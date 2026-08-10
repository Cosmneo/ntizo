import { useState } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Building2, Clock } from "lucide-react";
import { Badge, Button, Skeleton } from "@ntizo/frontend-ui";
import { AuthLayout } from "@/features/auth/components/auth-layout";
import { useCurrentUser } from "@/features/user/viewmodel/use-current-user";
import { providerErrorMessage } from "@/features/provider/viewmodel/error-message";
import { useAcceptInvite } from "@/features/provider/viewmodel/use-member-mutations";
import { useDeclineInvite, useInvite } from "@/features/provider/viewmodel/use-invite";
import type { PublicInvite } from "@/features/provider/domain/types";

/**
 * The page an invitation link opens.
 *
 * It used to fire the accept mutation on mount and show one line of text. That
 * made joining an organisation something that happened *to* someone: no
 * mention of which workspace, who invited them, or what they would be able to
 * do, and a redirect 800ms later. Joining a business is a consent, and consent
 * needs to be asked for.
 *
 * So the invitation is read first — over the anonymous endpoint, because the
 * token is the credential and the page must be able to explain itself before
 * asking anyone to sign in. Then a button.
 */
export function AcceptInvite() {
  const { t } = useTranslation("auth");
  const { token } = useParams({ from: "/_public/accept-invite/$token" });
  const nav = useNavigate();

  const { data: invite, isLoading, error } = useInvite(token);
  const { data: user, isLoading: userLoading } = useCurrentUser();
  const { mutateAsync: accept, isPending: accepting } = useAcceptInvite();
  const { mutateAsync: decline, isPending: declining } = useDeclineInvite();
  const [failure, setFailure] = useState<string | null>(null);

  if (isLoading || userLoading) return <InviteSkeleton />;

  // A token nobody holds and a token that never existed look the same on
  // purpose: distinguishing them would turn this page into an oracle for
  // guessing tokens.
  if (error || !invite) {
    return <DeadEnd title={t("inviteUnknownTitle")} body={t("inviteUnknownBody")} />;
  }

  if (invite.status !== "pending") {
    return (
      <DeadEnd
        title={t("inviteClosedTitle")}
        body={t(`inviteClosed.${invite.status}`)}
      />
    );
  }

  // Signed in as the wrong person. Accepting would put *this* account in the
  // workspace, which is not what the invitation said and not what the sender
  // meant, so it is refused before it is tried rather than after.
  const wrongAccount =
    !!user && user.email.toLowerCase() !== invite.email.toLowerCase();

  async function onAccept() {
    setFailure(null);
    try {
      await accept(token);
      await nav({ to: "/provider" });
    } catch (e) {
      setFailure(providerErrorMessage(t, e));
    }
  }

  async function onDecline() {
    setFailure(null);
    try {
      await decline(token);
      await nav({ to: "/" });
    } catch (e) {
      setFailure(providerErrorMessage(t, e));
    }
  }

  return (
    <AuthLayout title={t("inviteTitle", { name: invite.providerName })} subtitle="" footer={null}>
      <div className="grid gap-5">
        <Summary invite={invite} />

        {!user ? (
          // Signed out. The invitation has already been shown, so signing in is
          // now a step towards something known rather than a leap of faith —
          // which is the reason this page reads before it asks.
          <div className="grid gap-2.5">
            <p className="type-body text-[var(--color-muted-foreground)]">
              {t("inviteSignInPrompt", { email: invite.email })}
            </p>
            <Link to="/sign-in" search={{ next: `/accept-invite/${token}` }}>
              <Button className="w-full">{t("inviteSignIn")}</Button>
            </Link>
            <Link to="/sign-up" search={{ next: `/accept-invite/${token}` }}>
              <Button variant="outline" className="w-full">
                {t("inviteSignUp")}
              </Button>
            </Link>
          </div>
        ) : wrongAccount ? (
          <div className="grid gap-3">
            <Warning>
              {t("inviteWrongAccount", { invited: invite.email, current: user.email })}
            </Warning>
            <Button variant="outline" onClick={() => void nav({ to: "/account" })}>
              {t("inviteSwitchAccount")}
            </Button>
          </div>
        ) : (
          <div className="grid gap-2.5">
            <Button
              className="w-full"
              disabled={accepting || declining}
              onClick={() => void onAccept()}
            >
              {accepting ? t("acceptingInvite") : t("inviteAccept")}
            </Button>
            {/* "Not now" leaves without deciding; declining is a decision the
                sender sees. Two different things, so two different controls. */}
            <Button
              variant="ghost"
              className="w-full"
              disabled={accepting || declining}
              onClick={() => void onDecline()}
            >
              {declining ? t("inviteDeclining") : t("inviteDecline")}
            </Button>
            <Link to="/" className="type-caption text-center text-[var(--color-muted-foreground)] hover:underline">
              {t("inviteNotNow")}
            </Link>
          </div>
        )}

        {failure && (
          <p className="type-body text-center text-[var(--color-destructive)]">{failure}</p>
        )}
      </div>
    </AuthLayout>
  );
}

/** What is being joined, before anything is decided about it. */
function Summary({ invite }: { invite: PublicInvite }) {
  const { t, i18n } = useTranslation("auth");
  const expires = new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language, {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(invite.expiresAt));

  return (
    <div className="grid gap-4 rounded-[var(--radius-card)] border border-[var(--color-border)] p-5">
      <div className="flex items-center gap-3.5">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[var(--radius-card-sm)] bg-[var(--color-muted)] text-[var(--color-primary)]">
          <Building2 className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="type-body-medium truncate font-semibold">{invite.providerName}</p>
          <p className="type-caption truncate text-[var(--color-muted-foreground)]">
            {t("inviteFrom", { name: invite.inviterName })}
          </p>
        </div>
      </div>

      <dl className="grid gap-2.5 border-t border-[var(--color-border)] pt-4">
        <Row label={t("inviteRoleLabel")}>
          <Badge tone="info">{t(`inviteRole.${invite.role}`)}</Badge>
        </Row>
        <Row label={t("inviteExpiresLabel")}>
          <span className="type-body">{expires}</span>
        </Row>
      </dl>

      <p className="type-caption text-[var(--color-muted-foreground)]">
        {t(`inviteRoleBlurb.${invite.role}`)}
      </p>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="type-caption text-[var(--color-muted-foreground)]">{label}</dt>
      <dd className="m-0 text-right">{children}</dd>
    </div>
  );
}

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <p className="type-body flex items-start gap-2.5 rounded-[var(--radius-card-sm)] border border-[color-mix(in_srgb,var(--color-warning,#b45309)_35%,transparent)] bg-[color-mix(in_srgb,var(--color-warning,#b45309)_8%,transparent)] px-4 py-3">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      {children}
    </p>
  );
}

/**
 * An invitation that cannot be used.
 *
 * No retry button: nothing the reader can do changes the outcome, and a
 * control that cannot work is worse than none. The way out is asking the
 * sender for a new one, which the copy says.
 */
function DeadEnd({ title, body }: { title: string; body: string }) {
  const { t } = useTranslation("auth");
  return (
    <AuthLayout title={title} subtitle="" footer={null}>
      <div className="grid gap-5 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[var(--color-muted)]">
          <Clock className="h-6 w-6 text-[var(--color-muted-foreground)]" />
        </span>
        <p className="type-body text-[var(--color-muted-foreground)]">{body}</p>
        <Link to="/">
          <Button variant="outline" className="w-full">
            {t("inviteGoHome")}
          </Button>
        </Link>
      </div>
    </AuthLayout>
  );
}

function InviteSkeleton() {
  const { t } = useTranslation("auth");
  return (
    <AuthLayout title={t("acceptInvite")} subtitle="" footer={null}>
      <div className="grid gap-5" aria-busy="true">
        <div className="grid gap-4 rounded-[var(--radius-card)] border border-[var(--color-border)] p-5">
          <div className="flex items-center gap-3.5">
            <Skeleton className="h-11 w-11 shrink-0 rounded-[var(--radius-card-sm)]" />
            <div className="grid flex-1 gap-1.5">
              <Skeleton className="h-[23px] w-40" />
              <Skeleton className="h-[17px] w-52" />
            </div>
          </div>
          <div className="grid gap-2.5 border-t border-[var(--color-border)] pt-4">
            <Skeleton className="h-[22px] w-full" />
            <Skeleton className="h-[22px] w-full" />
          </div>
          <Skeleton className="h-[17px] w-full" />
        </div>
        <Skeleton className="h-11 w-full rounded-[var(--radius-field)]" />
      </div>
    </AuthLayout>
  );
}
