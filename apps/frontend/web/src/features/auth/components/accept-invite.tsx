import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { AuthLayout } from "@/features/auth/components/auth-layout";
import { providerErrorMessage } from "@/features/provider/viewmodel/error-message";
import { useAcceptInvite } from "@/features/provider/viewmodel/use-member-mutations";

export function AcceptInvite() {
  const { t } = useTranslation("auth");
  const { token } = useParams({ from: "/_public/accept-invite/$token" });
  const nav = useNavigate();
  const [status, setStatus] = useState<"pending" | "ok" | "error">("pending");
  const [error, setError] = useState<string | null>(null);
  const hasFiredRef = useRef(false);
  const { mutateAsync: accept } = useAcceptInvite();

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setError(t("missingInviteToken"));
      return;
    }
    if (hasFiredRef.current) return;
    hasFiredRef.current = true;
    accept(token)
      .then(() => {
        setStatus("ok");
        setTimeout(() => nav({ to: "/provider" }), 800);
      })
      .catch((e) => {
        setStatus("error");
        setError(e instanceof Error ? providerErrorMessage(t, e) : t("inviteError"));
      });
  }, [token, nav, t, accept]);

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
