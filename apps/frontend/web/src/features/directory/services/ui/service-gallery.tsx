import { useState } from "react";
import { cn } from "@ntizo/frontend-ui";

/**
 * One large image with the rest as thumbnails beneath; clicking a thumbnail
 * promotes it.
 *
 * Renders nothing at all with no images, rather than a grey placeholder box —
 * an empty frame says the service has no photo more loudly than its absence
 * does.
 */
export function ServiceGallery({ images, alt }: { images: readonly string[]; alt: string }) {
  const [active, setActive] = useState(0);
  if (images.length === 0) return null;
  const main = images[active] ?? images[0]!;
  return (
    <div className="grid gap-3">
      <img
        src={main}
        alt={alt}
        className="aspect-[4/3] w-full rounded-[var(--radius-card)] object-cover"
      />
      {images.length > 1 && (
        <ul className="flex list-none gap-2 overflow-x-auto p-0">
          {images.map((src, i) => (
            <li key={src}>
              <button
                type="button"
                onClick={() => setActive(i)}
                aria-label={`${alt} ${i + 1}`}
                aria-current={i === active}
                className={cn(
                  "block h-16 w-20 overflow-hidden rounded-[var(--radius-card-sm)] border-2 transition-colors",
                  i === active ? "border-[var(--color-primary)]" : "border-transparent",
                )}
              >
                <img src={src} alt="" className="h-full w-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
