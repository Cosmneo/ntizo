import type { MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { cn } from "@ntizo/frontend-ui";
import type { NotificationDTO } from "@ntizo/shared/read-models";
import { presentationFor } from "@/features/notifications/domain/notification-presentation";
import { targetFor, type InboxZone } from "@/features/notifications/domain/notification-target";
import { detailFor } from "@/features/notifications/domain/notification-detail";
import { formatWhen, type InboxGroupKey } from "@/features/notifications/domain/inbox-groups";

/**
 * Navy where the listings refresh has landed, the ordinary ink where it has
 * not: `--color-headline` arrives with that branch, and until it merges the
 * fallback keeps this page on the palette it ships with rather than on a
 * token that resolves to nothing.
 *
 * Written out in full at every use rather than interpolated from one
 * constant: Tailwind generates a utility only for class strings it can read
 * verbatim in the source, and `bg-[${HEADLINE}]` is not one — the dot it
 * was meant to paint rendered as nothing at all, and the disc only looked
 * right because an unstyled border inherits the ink. The repetition is the
 * price of the classes existing.
 */
const HEADLINE_TEXT = "text-[var(--color-headline,var(--color-foreground))]";
const HEADLINE_BORDER = "border-[var(--color-headline,var(--color-foreground))]";
const HEADLINE_BG = "bg-[var(--color-headline,var(--color-foreground))]";
const HEADLINE_HOVER_BORDER = "hover:border-[var(--color-headline,var(--color-foreground))]";

/**
 * One row.
 *
 * **Unread is a dot and a heavier sentence, not a ground.** The list used to
 * tint every unread row, and an inbox where most rows are unread — every new
 * account's — read as one pale error state. The dot column is present on
 * every row and empty on read ones, so the sentences stay on one vertical
 * line whatever the mix.
 *
 * **The whole row opens the thing it is about.** `targetFor` decides where;
 * when it has nowhere to send the reader the row is a button that only marks
 * itself read, which is what every row used to be. The link itself wraps the
 * sentence only and is stretched over the row with a pseudo-element — the
 * accessible name of a row is therefore its sentence, not the sentence plus
 * the detail plus the time read out as one run.
 *
 * **Mark-as-read is a sibling of the link, not a child.** An interactive
 * element inside another is invalid, and a control that also opened the
 * booking would defeat its point: it exists for the reader who wants to clear
 * a row without going anywhere. It sits above the stretched link (`z-10`) and
 * shows on hover and on focus, so a keyboard reaches it too.
 *
 * `todayIso` and `group` arrive as props rather than being derived here: the
 * day a row belongs to is what `groupByDay`'s tests pin down, and the time it
 * prints depends on that day.
 */
export function NotificationCell({
  notification,
  group,
  zone,
  todayIso,
  onMarkRead,
}: {
  notification: NotificationDTO;
  group: InboxGroupKey;
  zone: InboxZone;
  todayIso: string;
  onMarkRead: (id: string) => void;
}) {
  const { t, i18n } = useTranslation("notifications");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const { icon: Icon, key } = presentationFor(notification.type);
  const target = targetFor(notification, zone);
  const unread = !notification.read;

  // The payload is passed as interpolation values via `replace`, not spread
  // into i18next's own options object: `count`, `context`, `lng`, `ns` and
  // `defaultValue` are reserved there, and the read model calls this payload
  // "deliberately unconstrained" — a future handler adding, say, a
  // `defaultValue` key would otherwise silently replace the rendered sentence
  // instead of being read as a value.
  const sentence = t(`type.${key}`, { replace: notification.payload });
  const detail =
    detailFor(notification, locale) ?? (target?.kind === "thread" ? t("openConversation") : null);
  // Only a plain primary click. A cmd/ctrl/shift/middle click hands the
  // target to another tab, and the router honours that — but it still runs
  // this handler, and a row this tab never showed the reader must not be
  // marked read by it.
  const markIfUnread = (event: MouseEvent<HTMLElement>) => {
    if (!unread) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    onMarkRead(notification.id);
  };

  const stretched =
    "text-left after:absolute after:inset-0 after:content-[''] focus-visible:outline-none";

  return (
    <li
      className={cn(
        "group relative isolate grid grid-cols-[14px_36px_minmax(0,1fr)_auto] items-start gap-3.5 border-t border-[var(--color-border)] py-[15px] first:border-t-0",
        // The hover ground bleeds a little past the hairlines rather than
        // stopping at them, so it reads as a highlight over the row and not
        // as a filled cell in a table.
        "before:absolute before:inset-y-0 before:-inset-x-3 before:-z-10 before:rounded-xl before:content-['']",
        "hover:before:bg-[var(--color-muted)] focus-within:before:bg-[var(--color-muted)]",
      )}
    >
      <span
        aria-hidden="true"
        className={cn("mt-[13px] h-2 w-2 justify-self-center rounded-full", unread && HEADLINE_BG)}
      />

      <span
        aria-hidden="true"
        className={cn(
          "grid h-9 w-9 place-items-center rounded-full border bg-[var(--color-background)]",
          unread
            ? cn(HEADLINE_BORDER, HEADLINE_TEXT)
            : "border-[var(--color-border)] text-[var(--color-muted-foreground)]",
        )}
      >
        <Icon className="h-[17px] w-[17px]" />
      </span>

      <span className="grid min-w-0 gap-[3px] pt-px">
        <span className={cn("type-body leading-[1.4]", unread ? "font-semibold" : "font-medium")}>
          {target ? (
            <Link
              to={target.to}
              params={target.params}
              search={target.search}
              onClick={markIfUnread}
              className={stretched}
            >
              {sentence}
            </Link>
          ) : (
            <button type="button" onClick={markIfUnread} className={stretched}>
              {sentence}
            </button>
          )}
        </span>
        {/* Two lines on a phone, where a service name and a provider name
            rarely fit on one; a single truncated line from `sm`, where they
            do and a second line would only be the odd overflow. */}
        {detail && (
          <span className="type-caption line-clamp-2 text-[13px] text-[var(--color-muted-foreground)] sm:line-clamp-none sm:truncate">
            {detail}
          </span>
        )}
      </span>

      <span className="flex items-center gap-3 pt-0.5">
        {unread && (
          <button
            type="button"
            aria-label={t("markRead")}
            title={t("markRead")}
            onClick={() => onMarkRead(notification.id)}
            className={cn(
              "relative z-10 grid h-[30px] w-[30px] place-items-center rounded-full border border-[var(--color-border)] bg-[var(--color-background)] transition-opacity",
              HEADLINE_TEXT,
              // Invisible AND untouchable until hovered or focused. Tailwind
              // wraps `group-hover` in `@media (hover: hover)`, so on a phone
              // this never becomes visible — and an invisible button that
              // still catches taps would mark the row read instead of
              // opening it. Without a hover it is out of the hit-test
              // entirely; the whole row does what it always did on touch.
              "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100",
              "focus-visible:pointer-events-auto focus-visible:opacity-100",
              HEADLINE_HOVER_BORDER,
            )}
          >
            <Check aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2.2} />
          </button>
        )}
        <time
          dateTime={notification.createdAt}
          className="type-caption whitespace-nowrap text-[13px] tabular-nums text-[var(--color-muted-foreground)]"
        >
          {formatWhen(notification.createdAt, group, locale, todayIso)}
        </time>
      </span>
    </li>
  );
}
