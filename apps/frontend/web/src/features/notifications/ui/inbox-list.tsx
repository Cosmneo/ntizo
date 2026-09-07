import { useTranslation } from "react-i18next";
import type { NotificationDTO } from "@ntizo/shared/read-models";
import {
  groupByDay,
  type InboxGroupKey,
} from "@/features/notifications/domain/inbox-groups";
import type { InboxZone } from "@/features/notifications/domain/notification-target";
import { NotificationCell } from "@/features/notifications/ui/notification-cell";

const HEADING_KEY: Record<InboxGroupKey, string> = {
  today: "groupToday",
  yesterday: "groupYesterday",
  earlier: "groupEarlier",
};

/**
 * An inbox's items, split into the day headings `groupByDay` decided.
 *
 * Hairlines, not a card. The rows used to sit inside a bordered, rounded box
 * with a rule between each pair; the box is gone, the rules stay, and each
 * heading is a short sentence-case line in the headline colour rather than a
 * tracked-out label. The row draws its own top rule (and drops it when it is
 * first in its group), so `NotificationCell` stays agnostic of what it is
 * inside — the same row renders the same way whether it is the only item in
 * "Today" or one of twenty.
 *
 * `todayIso` arrives as a prop rather than being read here with `new Date()`:
 * the day boundary is exactly what `groupByDay`'s own tests pin down, and a
 * component that reaches for the clock itself cannot be pinned the same way.
 */
export function InboxList({
  items,
  todayIso,
  zone,
  onMarkRead,
}: {
  items: NotificationDTO[];
  todayIso: string;
  zone: InboxZone;
  onMarkRead: (id: string) => void;
}) {
  const { t } = useTranslation("notifications");
  const groups = groupByDay(items, todayIso);

  return (
    <div className="grid gap-6">
      {groups.map((group) => (
        <section key={group.key}>
          <h2 className="type-caption mb-2 text-[13px] font-bold text-[var(--color-headline,var(--color-foreground))]">
            {t(HEADING_KEY[group.key])}
          </h2>
          <ul className="grid list-none p-0">
            {group.items.map((item) => (
              <NotificationCell
                key={item.id}
                notification={item}
                group={group.key}
                zone={zone}
                todayIso={todayIso}
                onMarkRead={onMarkRead}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
