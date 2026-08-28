import { useId, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { Button, Dialog, DialogContent, cn } from "@ntizo/frontend-ui";

/** How many side tiles sit beside the main photo, at most. */
const SIDE_TILES = 2;

/**
 * The collage both detail pages open with: one large photo, up to two more
 * stacked beside it, and — when there are more than the collage can show — a
 * button naming the rest, which opens every photo in a dialog.
 *
 * The overflow is a dialog, not a carousel bolted onto the collage. A reader
 * has to operate a carousel to find out how many pictures there are at all;
 * naming the count on the button says it in the space of one control, and the
 * pictures themselves get a page of their own — a grid meant for looking at
 * them — rather than a strip fighting the collage for room. This is the same
 * reasoning the provider portfolio grid this replaced used for its own "+N
 * more" tile; the dialog here just replaces the tile with something worth
 * clicking, since a detail page (unlike a listing card) can afford the extra
 * tap.
 *
 * The side tiles carry `alt=""`. They sit right next to the one photo this
 * component does describe, and "photograph 2 of 8" is not a description of
 * anything — it is decorative filler around the labelled tile. Inside the
 * dialog every photo is equally presented, with no single one already
 * described, so there each image is labelled by its position instead.
 *
 * Renders nothing at all with no photos — the same call `ServiceGallery`
 * already makes: an empty frame reads as a page that failed to load, where
 * the plain absence of the section reads as "no photo yet".
 */
export function DetailGallery({
  images,
  alt,
  badge,
}: {
  images: readonly string[];
  /** What the one described photo shows — a provider's or a service's name. */
  alt: string;
  /** Rendered over the main tile, e.g. a "verified documents" pill. */
  badge?: ReactNode;
}) {
  const { t } = useTranslation("directory");
  const [open, setOpen] = useState(false);
  const titleId = useId();

  if (images.length === 0) return null;

  const [main, ...rest] = images as [string, ...string[]];
  const sideImages = rest.slice(0, SIDE_TILES);
  const hasSide = sideImages.length > 0;
  const showViewAll = images.length > SIDE_TILES + 1;

  return (
    <div className="grid grid-cols-1 gap-3 sm:h-[clamp(340px,40vw,520px)] sm:grid-cols-[minmax(0,1.72fr)_minmax(0,1fr)]">
      <div
        className={cn(
          "relative aspect-[4/3] overflow-hidden rounded-[var(--radius-card)] bg-[var(--color-muted)] sm:aspect-auto sm:h-full",
          // A single photo has no side column to sit beside — without this,
          // the outer grid's two-track template still reserves the second
          // track, and CSS Grid's auto-placement leaves it empty rather than
          // giving the one tile the room. That empty second track is exactly
          // what every provider and service looks like on the day of its
          // first photo, so this is not a rare case to shrug off.
          !hasSide && "sm:col-span-2",
        )}
      >
        <img src={main} alt={alt} className="h-full w-full object-cover" />
        {badge && <div className="absolute top-3 left-3">{badge}</div>}
      </div>

      {hasSide && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-1 sm:grid-rows-[1fr_1fr_auto]">
          {sideImages.map((src) => (
            <div
              key={src}
              className={cn(
                "overflow-hidden rounded-[var(--radius-card)] bg-[var(--color-muted)]",
                // With only one side photo (two images in the whole gallery),
                // there is no second tile to fill the paired row below it —
                // so the lone tile takes both rows instead of leaving one
                // empty, and the full width of the mobile pair instead of
                // half of it.
                sideImages.length === 1 && "col-span-2 sm:col-span-1 sm:row-span-2",
              )}
            >
              <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
            </div>
          ))}

          {showViewAll && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(true)}
              className="col-span-2 sm:col-span-1"
            >
              {t("galleryViewAll", { count: images.length })}
            </Button>
          )}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[88svh] w-full max-w-3xl flex-col overflow-hidden rounded-[var(--radius-card)] p-0">
          {/*
           * `Dialog`/`DialogContent` draw a fixed backdrop and a panel and
           * nothing else — no role, no name, no focus trap — the same bare
           * primitive `mobile-search-sheet.tsx` documents for `Sheet`. The
           * `role="dialog"` and `aria-labelledby` below are supplied here for
           * the same reason they are there: without them a screen reader is
           * handed a floating panel with no boundary and no name.
           */}
          <div role="dialog" aria-labelledby={titleId} className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-4">
              <h2 id={titleId} className="type-h3">
                {t("galleryDialogTitle")}
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t("close")}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid flex-1 grid-cols-2 gap-3 overflow-y-auto border-t border-[var(--color-border)] p-5 sm:grid-cols-3">
              {images.map((src, index) => (
                <img
                  key={src}
                  src={src}
                  alt={`${alt} ${index + 1}`}
                  loading="lazy"
                  className="aspect-[4/3] w-full rounded-[var(--radius-card-sm)] object-cover"
                />
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
