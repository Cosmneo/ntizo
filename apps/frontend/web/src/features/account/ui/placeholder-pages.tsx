import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { CalendarDays, Heart, MessageSquare } from "lucide-react";
import { EmptyCard } from "@/shared/components/empty-card";

/**
 * The three customer pages whose features do not exist yet.
 *
 * Kept in one file because they are the same page three times — separating
 * them into three near-identical files would imply differences that are not
 * there. Each moves out on its own the moment it grows real content.
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

export function BookingsPage() {
  const { t } = useTranslation("account");
  return (
    <Shell title={t("bookingsTitle")}>
      <EmptyCard
        framed
        badge={CalendarDays}
        title={t("bookingsEmptyTitle")}
        body={t("bookingsEmptyBody")}
        action={<BrowseLink label={t("browseProviders")} />}
      />
    </Shell>
  );
}

export function MessagesPage() {
  const { t } = useTranslation("account");
  return (
    <Shell title={t("messagesTitle")}>
      <EmptyCard
        framed
        badge={MessageSquare}
        title={t("messagesEmptyTitle")}
        body={t("messagesEmptyBody")}
      />
    </Shell>
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
