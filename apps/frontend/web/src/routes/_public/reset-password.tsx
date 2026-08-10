import { createFileRoute } from "@tanstack/react-router";
import { ResetPassword } from "@/features/auth/components/reset-password";

export const Route = createFileRoute("/_public/reset-password")({
  component: ResetPassword,
});
