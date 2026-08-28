import { useState, type ReactNode } from "react";
import { Tag, icons } from "lucide-react";
import { cn } from "@ntizo/frontend-ui";
import {
  initialsOf,
  placeholderHue,
} from "@/shared/components/browse/domain/placeholder-tile";

/**
 * The picture end of a listing card.
 *
 * The fallback is generated rather than grey, and that is the whole reason this
 * component exists instead of an `<img>` with a background colour. Most
 * listings on this platform have no photograph — the placeholder is the common
 * case, not the exception — and a column of identical grey rectangles reads as
 * a page that failed to load.
 *
 * The tile's hue comes from the *category*, never from the listing's id: a
 * trade should look the same wherever it appears, and an id gives one plumber a
 * purple tile and the next a green one, which tells the reader nothing.
 *
 * The same tile also stands in for a photograph that exists in the data but
 * not at the URL any more: an object deleted from the bucket, a store moved,
 * a signed URL that expired. `onError` catches that and swaps the tile in — a
 * browser's broken-image glyph is worse than the grey rectangle this
 * component was built to avoid, so it is the one case the fallback cannot be
 * allowed to skip.
 *
 * That swap is client-only, and has to be: these pages are also rendered on
 * the server for crawlers, and the server has no way to know an `<img>` tag
 * will fail before a browser fetches it, nor does `onError` fire there at
 * all. The server still emits the `<img>`; a browser repairs it after
 * hydration. A crawler that does not run the page's script sees what the
 * server saw.
 */
export function ListingMedia({
  imageUrl,
  seed,
  name,
  icon,
  ratio = "4/3",
  badge,
  favourite,
}: {
  imageUrl: string | null;
  /** Decides the placeholder's hue. The category code — a trade looks the same everywhere. */
  seed: string;
  /** The business's name; its initials are the placeholder's mark. */
  name: string;
  /** A Lucide icon name from the category's `icon` column, or null. */
  icon: string | null;
  /** `4/3` beside the body on a desktop row, `16/10` stacked on a phone. */
  ratio?: "4/3" | "16/10";
  /** Top-left: "Most booked", "Urgent". */
  badge?: ReactNode;
  /** Top-right. Left empty by this plan; the favourites plan fills it. */
  favourite?: ReactNode;
}) {
  const Icon = iconComponent(icon);
  const hue = placeholderHue(seed);
  // Holds the URL that has already failed, not a plain "has this card ever
  // failed" flag — a flag would keep the fallback drawn forever once tripped,
  // even after this same card scrolls out and back in carrying a different
  // `imageUrl`. Comparing against the current prop instead gives a new URL a
  // fresh attempt for free, and is also what stops a retry loop on its own:
  // the first `onError` sets this to the URL that just failed, the `<img>`
  // for that URL is then unmounted in favour of the tile, and nothing is left
  // on the page that could fire a second `onError`.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = imageUrl !== null && imageUrl !== failedUrl;

  return (
    <div
      className={cn(
        "relative overflow-hidden bg-[var(--color-muted)]",
        ratio === "4/3" ? "aspect-[4/3] rounded-[var(--radius-card-sm)]" : "aspect-[16/10]",
      )}
    >
      {showImage ? (
        // An empty alt, not the listing's name: the name is the heading right
        // beside this, and repeating it is read twice and says nothing new
        // either time.
        <img
          src={imageUrl}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover"
          onError={() => setFailedUrl(imageUrl)}
        />
      ) : (
        <span
          data-testid="listing-placeholder"
          className="grid h-full w-full place-items-center"
          // Inline, because the hue is computed per listing and Tailwind cannot
          // emit a class for a value it does not know at build time. Two stops
          // rather than a flat fill so the tile has a direction and does not
          // read as a swatch.
          style={{
            background: `linear-gradient(140deg, hsl(${String(hue)} 62% 58%), hsl(${String(
              (hue + 22) % 360,
            )} 68% 40%))`,
          }}
        >
          <Icon
            className="absolute h-[58%] w-[58%] text-white opacity-20"
            aria-hidden="true"
            strokeWidth={1.4}
          />
          <span
            aria-hidden="true"
            className="font-rounded relative text-[1.6rem] font-semibold text-white/90"
          >
            {initialsOf(name)}
          </span>
        </span>
      )}

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

/**
 * A Lucide name from the database, resolved to a component.
 *
 * Looked up rather than imported one by one: the set lives in a table an
 * administrator edits, so the code cannot know it at build time. An unknown or
 * missing name falls back to a tag rather than rendering nothing — a tile with
 * a hole in it reads as a broken image, which is the one thing the generated
 * placeholder exists to avoid.
 */
function iconComponent(name: string | null) {
  if (!name) return Tag;
  return icons[name as keyof typeof icons] ?? Tag;
}
