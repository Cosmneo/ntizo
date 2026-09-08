import { MediaFallback } from "@/shared/components/brand-image";

/**
 * Three photographs of the work, at two scales.
 *
 * Ntizo owns none yet, so all three draw the same designed empty state every
 * listing uses. When the company has photographs, they replace `SLOTS` and
 * nothing else here changes.
 */
const SLOTS = ["row-span-2", "", ""] as const;

export function HeroCollage() {
  return (
    <div
      aria-hidden="true"
      /* `hidden lg:grid`: below the two-column hero this is 360px of empty
         tiles between the claim and the first real thing on the page, because
         Ntizo owns no photographs yet — a phone reader scrolls past half a
         screen of nothing to reach the categories. It draws again at `lg`,
         where it sits beside the text rather than under it and costs no
         vertical room at all. When the photographs exist this is the one line
         to reconsider. */
      className="hidden h-[360px] grid-cols-[1.15fr_1fr] grid-rows-2 gap-3 lg:grid lg:h-[520px]"
    >
      {SLOTS.map((className, i) => (
        <div
          key={i}
          className={`relative overflow-hidden rounded-[20px] bg-[var(--color-navy-surface)] ${className}`}
        >
          <MediaFallback className="h-full w-full" />
        </div>
      ))}
    </div>
  );
}
