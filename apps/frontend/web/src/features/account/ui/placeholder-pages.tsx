import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { Heart } from "lucide-react";
import { EmptyCard } from "@/shared/components/empty-card";

/**
 * The customer pages whose features do not exist yet.
 *
 * Used to be three — bookings, messages, favourites — kept in one file
 * because they were the same page three times over. Messages moved out to
 * `features/messaging/ui/customer-messages-page.tsx` once the Communication
 * context shipped; bookings moved out to `features/bookings/ui/bookings-page.tsx`
 * once it read real rows. Favourites stays here until it gets the same
 * treatment.
 */

function Shell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    // No measure of its own: `CustomerShell` already wraps this in
    // `.page-shell`, the same width the site header uses, so a `max-w-*`
    // centred in here started the content ~276px right of the logo and ended
    // nowhere near the avatar. Filling the shell makes both edges line up with
    // the header instead of floating inside it.
    <div>
      <h1 className="type-h1">{title}</h1>
      <div className="mt-8">{children}</div>
    </div>
  );
}

/** The way out of an empty customer page is always the same: go and browse. */
function BrowseLink({ label }: { label: string }) {
  return (
    <Link
      to="/providers"
      className="rounded-full bg-[var(--color-primary)] px-5 py-2 text-sm font-semibold text-white hover:opacity-90"
    >
      {label}
    </Link>
  );
}

export function FavouritesPage() {
  const { t } = useTranslation("account");
  return (
    <Shell title={t("favouritesTitle")}>
      <EmptyCard
        framed
        badge={Heart}
        title={t("favouritesEmptyTitle")}
        body={t("favouritesEmptyBody")}
        action={<BrowseLink label={t("browseProviders")} />}
      />
    </Shell>
  );
}
