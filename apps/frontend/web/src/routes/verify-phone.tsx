import { createFileRoute, redirect } from "@tanstack/react-router";
import { authClient } from "@/shared/lib/api/auth-client";
import { VerifyPhone } from "@/features/auth/components/verify-phone";

/**
 * Deliberately outside `_public`: that layout bounces anyone with a session,
 * and this screen needs one — the number being verified is read from the
 * session rather than retyped, so a stranger cannot aim an OTP at a number
 * that isn't theirs.
 */
export const Route = createFileRoute("/verify-phone")({
  beforeLoad: async () => {
    const { data: session } = await authClient.getSession();
    if (!session) throw redirect({ to: "/sign-in" });
  },
  component: VerifyPhone,
});
