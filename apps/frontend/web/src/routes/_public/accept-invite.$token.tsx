import { createFileRoute } from "@tanstack/react-router";
import { AcceptInvite } from "@/features/auth/components/accept-invite";

/**
 * No guard.
 *
 * It used to bounce anonymous visitors to sign-in before they could see what
 * they had been invited to — which asks someone to make an account on faith.
 * The invitation is readable with the token alone, so the page shows it first
 * and offers sign-in from there, carrying `next` back to this URL.
 */
export const Route = createFileRoute("/_public/accept-invite/$token")({
  component: AcceptInvite,
});
