import { useTranslation } from "react-i18next";
import { cn } from "@ntizo/frontend-ui";
import type { NotificationDTO } from "@ntizo/shared/read-models";
import { presentationFor } from "@/features/notifications/domain/notification-presentation";

/**
 * One row.
 *
 * The unread state is a left border and a weight change, not a coloured
 * background: a list where half the rows are tinted reads as an error state,
 * and the dot is what people actually scan for.
 *
 * The whole row is a button because marking read is the only thing it does. If
 * a type ever needs to navigate somewhere, that belongs in a `target` map beside
 * `presentationFor`, not in a second control inside the row.
 */
export function NotificationCell({
  notification,
  onMarkRead,
}: {
  notification: NotificationDTO;
  onMarkRead: (id: string) => void;
}) {
  const { t, i18n } = useTranslation("notifications");
  const { icon: Icon, key } = presentationFor(notification.type);
  const locale = i18n.resolvedLanguage ?? i18n.language;

  return (
    <li>
      <button
        type="button"
        onClick={() => !notification.read && onMarkRead(notification.id)}
        className={cn(
          "flex w-full items-start gap-3 border-l-2 px-4 py-3.5 text-left transition-colors",
          notification.read
            ? "border-transparent hover:bg-[var(--color-muted)]"
            : "border-[var(--color-primary)] bg-[color-mix(in_srgb,var(--color-primary)_4%,transparent)] hover:bg-[color-mix(in_srgb,var(--color-primary)_7%,transparent)]",
        )}
      >
        <span
          aria-hidden="true"
          className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--color-muted)] text-[var(--color-muted-foreground)]"
        >
          <Icon className="h-4 w-4" />
        </span>

        <span className="min-w-0 flex-1">
          <span
            className={cn("type-body-medium block", !notification.read && "font-semibold")}
          >
            {/* The payload is passed as interpolation values via `replace`,
                not spread into i18next's own options object: `count`,
                `context`, `lng`, `ns` and `defaultValue` are reserved there,
                and the read model calls this payload "deliberately
                unconstrained" — a future handler adding, say, a
                `defaultValue` key would otherwise silently replace the
                rendered sentence instead of being read as a value. A type
                whose sentence needs a name finds it under `replace`; one
                that does not simply ignores the extras. */}
            {t(`type.${key}`, { replace: notification.payload })}
          </span>
          <time
            dateTime={notification.createdAt}
            className="type-caption mt-0.5 block text-[var(--color-muted-foreground)]"
          >
            {new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(
              new Date(notification.createdAt),
            )}
          </time>
        </span>
      </button>
    </li>
  );
}
