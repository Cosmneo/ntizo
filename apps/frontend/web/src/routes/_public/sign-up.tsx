import { createFileRoute } from "@tanstack/react-router";
import { SignUp } from "@/features/auth/components/sign-up";

export const Route = createFileRoute("/_public/sign-up")({
  /**
   * Where to go once the address is verified.
   *
   * Declared here so the router types it and `Link` can carry it — and so the
   * value survives a reload of the form. It is not trusted on the way out:
   * `isSafeInternalPath` gates it before it becomes a redirect target.
   */
  validateSearch: (search: Record<string, unknown>): { next?: string } =>
    typeof search["next"] === "string" ? { next: search["next"] } : {},
  component: SignUp,
});
