import { useEffect, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { AuthLayout } from "@/features/auth/components/auth-layout";
import { acceptInvite } from "@/features/provider/lib/provider-api";

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
        setTimeout(() => nav({ to: "/provider/overview" }), 800);
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
