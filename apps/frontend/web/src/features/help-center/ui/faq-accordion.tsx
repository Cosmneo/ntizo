import { ChevronDown } from "lucide-react";
import { cn } from "@ntizo/frontend-ui";
import type { FaqEntry } from "@/features/help-center/domain/faq";

/**
 * Questions that open one at a time.
 *
 * `<button aria-expanded>` over a `<details>`: the panel and `/help` both
 * need the open one to be controllable from outside (a search result opens
 * its own answer), and `details` state is the browser's, not React's.
 */
export function FaqAccordion({
  entries,
  openId,
  onToggle,
}: {
  entries: readonly FaqEntry[];
  openId: string | null;
  onToggle: (id: string) => void;
}) {
  return (
    <ul className="grid list-none gap-2 p-0">
      {entries.map((entry) => {
        const open = entry.id === openId;
        return (
          <li key={entry.id} className="rounded-[var(--radius-card)] border border-[var(--color-border)]">
            <button
              type="button"
              aria-expanded={open}
              onClick={() => onToggle(entry.id)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
            >
              <span className="type-body-medium">{entry.question}</span>
              <ChevronDown
                aria-hidden="true"
                className={cn("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")}
              />
            </button>
            {open && (
              <p className="type-body px-4 pb-4 text-[var(--color-muted-foreground)]">{entry.answer}</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
