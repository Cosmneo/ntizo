import { useState } from "react";
import { cn } from "@ntizo/frontend-ui";
import { BrandMark } from "@/shared/components/brand-mark";

/**
 * What stands in for a picture that is missing, or that a browser could not
 * fetch.
 *
 * One treatment everywhere, which is the point: the brand mark on the soft
 * ground, exactly as `EmptyCard` draws it. A reader who meets it on a listing
 * card, a service page and a checkout rail should recognise the same thing
 * each time rather than learning three different ways of being told a photo is
 * absent.
 *
 * The mark is sized as a share of the tile rather than in pixels, so the same
 * component reads correctly at 40px in a rail and at 600px on a detail page
 * without a caller passing a number.
 *
 * `aria-hidden`, because this says nothing a reader needs: the heading beside
 * it already names what the picture would have shown, and announcing "no
 * image" is an apology nobody asked for.
 */
export function MediaFallback({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      data-testid="media-fallback"
      className={cn(
        "grid h-full w-full place-items-center bg-[var(--color-muted)]",
        className,
      )}
    >
      <BrandMark className="h-[38%] max-h-24 min-h-5" />
    </span>
  );
}

/**
 * A picture that cannot break.
 *
 * Renders the `<img>` when there is a URL, and swaps in `MediaFallback` when
 * there is not — or when the one there is fails to load. A browser's
 * broken-image glyph is the worst of the three outcomes and the only one this
 * component refuses.
 *
 * The failure is remembered as *the URL that failed*, not as a boolean. A flag
 * would keep the fallback drawn forever once tripped, even after the same
 * component is handed a different `src` — which is what happens to a card
 * recycled by a virtualised list, or to a gallery whose thumbnail strip moves
 * the main image. Comparing against the current prop gives every new URL a
 * fresh attempt, and is also what stops a retry loop: the failing `<img>` is
 * unmounted in favour of the fallback, so nothing is left that could fire
 * `onError` a second time.
 *
 * The swap is client-only and has to be. These pages are server-rendered for
 * crawlers, and the server cannot know an `<img>` will fail before a browser
 * fetches it — `onError` does not fire there at all. The server emits the
 * `<img>`; a browser repairs it after hydration.
 */
export function BrandImage({
  src,
  alt,
  className,
  loading = "lazy",
}: {
  /** Null is a legitimate state, not an error — most listings have no photo. */
  src: string | null | undefined;
  /**
   * Usually empty. The heading beside a card already names it, and repeating
   * the name is read twice while saying nothing new either time. Pass a real
   * description only where the picture is the content.
   */
  alt: string;
  className?: string;
  loading?: "lazy" | "eager";
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  if (!src || src === failedUrl) return <MediaFallback className={className} />;

  return (
    <img
      src={src}
      alt={alt}
      loading={loading}
      className={className}
      onError={() => setFailedUrl(src)}
    />
  );
}
