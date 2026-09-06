import { cn } from "@ntizo/frontend-ui";
import { initialsOf } from "@/shared/domain/initials";

/**
 * What a listing with no photograph looks like.
 *
 * Most listings have none, and the page this replaces filled that space with a
 * pale grey rectangle: a column of them read as a page that had failed to load
 * rather than as a catalogue. This is navy, carries the brand's own tie pattern
 * from the identity manual, and states whose listing it is.
 *
 * The pattern is a background image and the initials are real text, so the tile
 * is legible to a screen reader as the name it stands for and invisible to it
 * as decoration.
 */
export function BrandTile({ name, className }: { name: string; className?: string }) {
  const initials = initialsOf(name);
  return (
    <span
      data-testid="brand-tile"
      className={cn(
        "relative grid h-full w-full place-items-center overflow-hidden",
        "bg-[linear-gradient(160deg,#00305f_0%,var(--color-navy-surface)_100%)]",
        className,
      )}
    >
      <span
        aria-hidden="true"
        data-testid="tie-pattern"
        className="pointer-events-none absolute -inset-x-[10%] -inset-y-[20%] -rotate-[8deg] opacity-[0.16] bg-[url('/brand/tie-pattern.svg')] bg-[length:96px_163px]"
      />
      <span className="relative text-[2rem] font-bold tracking-[0.02em] text-white/90">
        {/* A name with no letters — an emoji, punctuation — would render an
            empty tile that reads as a loading failure. */}
        {initials || "—"}
      </span>
    </span>
  );
}
