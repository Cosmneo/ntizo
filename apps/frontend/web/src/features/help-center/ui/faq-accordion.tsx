import { ChevronDown } from "lucide-react";
import { cn } from "@ntizo/frontend-ui";
import type { FaqEntry } from "@/features/help-center/domain/faq";
import { CARD_EDGE_CLASS } from "@/shared/components/card-surface";

/**
 * Questions that open one at a time.
 *
 * `<button aria-expanded>` over a `<details>`: which answer is open is the
 * caller's state, not the browser's, and both callers need it that way. The
 * panel seeds it from the search — a search that narrows to one question
 * opens that question, which is what makes clicking a popular question show
 * its answer rather than a second copy of the question (see `FaqResults` in
 * `help-faq.tsx`) — and both callers close the others whenever one opens.
 * `details` state lives in the DOM, where neither could reach it.
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
    <ul className="grid list-none gap-3 p-0">
      {entries.map((entry) => {
        const open = entry.id === openId;
        return (
          // The site's card, minus its padding — the button below fills the
          // row, so the padding is the button's or the reader finds a dead
          // margin inside a control that looks pressable.
          <li key={entry.id} className={CARD_EDGE_CLASS}>
            <button
              type="button"
              aria-expanded={open}
              onClick={() => onToggle(entry.id)}
              className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
            >
              <span className="type-body-medium font-semibold text-[var(--color-headline)]">
                {entry.question}
              </span>
              <ChevronDown
                aria-hidden="true"
                className={cn("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")}
              />
            </button>
            {open && (
              <p className="type-body px-5 pb-5 text-[var(--color-foreground)]">{entry.answer}</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
