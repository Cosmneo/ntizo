import { type ReactNode } from "react";
import { cn } from "@ntizo/frontend-ui";
import { BrandImage } from "@/shared/components/brand-image";

/**
 * The picture end of a listing card.
 *
 * The fallback is the Ntizo mark on the soft ground -- the same thing
 * `EmptyCard` draws and the same thing every other missing picture in the app
 * now shows. Most listings on this platform have no photograph, so the
 * placeholder is the common case rather than the exception, and it had better
 * be a deliberate mark rather than a grey rectangle.
 *
 * It replaced a generated tile: a per-trade gradient carrying the business's
 * initials and its category icon. That tile was better at one thing -- a grid
 * of twenty was scannable, because a plumber was always the same hue -- and
 * worse at the thing that was asked for, which is that a reader meet one
 * treatment for a missing picture everywhere in the product rather than a
 * different one per surface. The trade is stated here because it is a real
 * trade and somebody may want it back.
 *
 * `BrandImage` also covers a photograph that exists in the data but not at the
 * URL any more -- an object deleted from the bucket, a bucket moved, a signed
 * URL expired. That is not hypothetical: every seeded provider photo on dev is
 * a dead URL today.
 */
export function ListingMedia({
  imageUrl,
  ratio = "4/3",
  badge,
  favourite,
}: {
  imageUrl: string | null;
  /** `4/3` beside the body on a desktop row, `16/10` stacked on a phone. */
  ratio?: "4/3" | "16/10";
  /** Top-left: "Most booked", "Urgent". */
  badge?: ReactNode;
  /** Top-right. Left empty by this plan; the favourites plan fills it. */
  favourite?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden bg-[var(--color-muted)]",
        ratio === "4/3" ? "aspect-[4/3] rounded-[var(--radius-card-sm)]" : "aspect-[16/10]",
      )}
    >
      {/* An empty alt, not the listing's name: the name is the heading right
          beside this, and repeating it is read twice and says nothing new
          either time. */}
      <BrandImage src={imageUrl} alt="" className="h-full w-full object-cover" />

      {badge && (
        <span data-testid="listing-badge" className="absolute top-2.5 left-2.5 z-10">
          {badge}
        </span>
      )}
      {favourite && (
        <span data-testid="listing-favourite" className="absolute top-2.5 right-2.5 z-10">
          {favourite}
        </span>
      )}
    </div>
  );
}
