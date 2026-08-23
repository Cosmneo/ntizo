import { useTranslation } from "react-i18next";
import type { NotificationDTO } from "@ntizo/shared/read-models";
import {
  groupByDay,
  type InboxGroupKey,
} from "@/features/notifications/domain/inbox-groups";
import { NotificationCell } from "@/features/notifications/ui/notification-cell";

const HEADING_KEY: Record<InboxGroupKey, string> = {
  today: "groupToday",
  yesterday: "groupYesterday",
  earlier: "groupEarlier",
};

/**
 * An inbox's items, split into the day headings `groupByDay` decided.
 *
 * `todayIso` arrives as a prop rather than being read here with `new Date()`:
 * the day boundary is exactly what `groupByDay`'s own tests pin down, and a
 * component that reaches for the clock itself cannot be pinned the same way.
 *
 * `divide-y` on the list draws the rule between rows rather than a border on
 * each cell, so `NotificationCell` stays agnostic of what it is inside — the
 * same row renders the same way whether it is the only item in "Today" or one
 * of twenty.
 */
export function InboxList({
  items,
  todayIso,
  onMarkRead,
}: {
  items: NotificationDTO[];
  todayIso: string;
  onMarkRead: (id: string) => void;
}) {
  const { t } = useTranslation("notifications");
  const groups = groupByDay(items, todayIso);

  return (
    <div className="grid gap-6">
      {groups.map((group) => (
        <section key={group.key}>
          <h2 className="type-caption mb-2 font-bold tracking-[0.14em] text-[var(--color-muted-foreground)] uppercase">
            {t(HEADING_KEY[group.key])}
          </h2>
          <ul className="grid list-none divide-y divide-[var(--color-border)] overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] p-0">
            {group.items.map((item) => (
              <NotificationCell key={item.id} notification={item} onMarkRead={onMarkRead} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
