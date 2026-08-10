import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { CalendarDays, Heart, MessageSquare } from "lucide-react";
import { EmptyState } from "@/features/account/ui/empty-state";

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
    <div className="mx-auto max-w-3xl">
      <h1 className="type-h1">{title}</h1>
      <div className="mt-8">{children}</div>
    </div>
  );
}

export function BookingsPage() {
  const { t } = useTranslation("account");
  return (
    <Shell title={t("bookingsTitle")}>
      <EmptyState
        icon={<CalendarDays className="h-6 w-6" />}
        title={t("bookingsEmptyTitle")}
        body={t("bookingsEmptyBody")}
        action={
          <Link
            to="/providers"
            className="mt-2 rounded-full bg-[var(--color-primary)] px-5 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            {t("browseProviders")}
          </Link>
        }
      />
    </Shell>
  );
}

export function MessagesPage() {
  const { t } = useTranslation("account");
  return (
    <Shell title={t("messagesTitle")}>
      <EmptyState
        icon={<MessageSquare className="h-6 w-6" />}
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
      <EmptyState
        icon={<Heart className="h-6 w-6" />}
        title={t("favouritesEmptyTitle")}
        body={t("favouritesEmptyBody")}
        action={
          <Link
            to="/providers"
            className="mt-2 rounded-full bg-[var(--color-primary)] px-5 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            {t("browseProviders")}
          </Link>
        }
      />
    </Shell>
  );
}
