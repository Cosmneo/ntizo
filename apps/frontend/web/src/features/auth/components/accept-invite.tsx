import { useEffect, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { AuthLayout } from "@/features/auth/components/auth-layout";
import { API_BASE_URL } from "@/shared/lib/api/auth-client";

// NOTE: `@/features/provider/lib/provider-api` (which owns `acceptInvite`) doesn't
// exist yet — it's migrated wholesale in Task 6. This inline call preserves the
// exact same request/response contract so it can be swapped for the shared
// `acceptInvite` import once that module lands, without behavior changes.
async function acceptInvite(token: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/providers/invites/${token}/accept`, {
    method: "POST",
    credentials: "include",
  });
  if (res.ok) return;
  const text = await res.text();
  let message = res.statusText;
  if (text) {
    try {
      const body = JSON.parse(text) as { error?: string };
      message = body.error ?? message;
    } catch {
      message = text;
    }
  }
  throw new Error(message);
}

export function AcceptInvite() {
  const { t } = useTranslation("auth");
  const { token } = useParams({ from: "/_public/accept-invite/$token" });
  const nav = useNavigate();
  const [status, setStatus] = useState<"pending" | "ok" | "error">("pending");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setError(t("missingInviteToken"));
      return;
    }
    acceptInvite(token)
      .then(() => {
        setStatus("ok");
        setTimeout(() => nav({ to: "/provider/overview" as string }), 800);
      })
      .catch((e) => {
        setStatus("error");
        setError(e instanceof Error ? e.message : t("inviteError"));
      });
  }, [token, nav, t]);

  return (
    <AuthLayout title={t("acceptInvite")} subtitle="" footer={null}>
      {status === "pending" && <p className="text-center">{t("acceptingInvite")}</p>}
      {status === "ok" && <p className="text-center">{t("inviteAccepted")}</p>}
      {status === "error" && (
        <p className="text-center text-[var(--color-destructive)]">{error}</p>
      )}
    </AuthLayout>
  );
}
