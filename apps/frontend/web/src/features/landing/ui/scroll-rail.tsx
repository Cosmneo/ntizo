import { cn } from "@ntizo/frontend-ui";

/**
 * A row that scrolls sideways on a phone and becomes a grid on a wide screen.
 *
 * On a 390px screen a four-column grid gives each card ninety pixels, and a
 * two-column one turns eight categories into four rows of scrolling. Neither
 * shows what these sections are for, which is browsing — the reference apps all
 * use a rail here for the same reason.
 *
 * Three details do most of the work, and leaving any of them out produces
 * something that technically scrolls and reads as broken:
 *
 *  - **Peek.** The next card is deliberately cut off at the edge. That sliver
 *    is the only thing telling somebody there is more; a rail whose last
 *    visible card ends flush at the screen edge looks like the end of the list.
 *  - **Full-bleed with matching padding.** The rail runs edge to edge while its
 *    first card still lines up with the heading above it. A rail inset to the
 *    page gutter has the cards stopping short of the edge, which reads as a
 *    cropped layout rather than a scrollable one.
 *  - **Snap.** Cards come to rest aligned instead of halfway.
 */
export function ScrollRail({
  children,
  /** Desktop columns. Below `md` this is ignored — it is one scrolling row. */
  columns,
  /** How much of the viewport one card takes on a phone. */
  cardWidth = "72%",
  className,
}: {
  children: React.ReactNode;
  columns: 2 | 3 | 4;
  cardWidth?: string;
  className?: string;
}) {
  const grid = {
    2: "md:grid-cols-2",
    3: "md:grid-cols-3",
    4: "md:grid-cols-4",
  }[columns];

  return (
    <div
      style={{ ["--rail-card" as string]: cardWidth }}
      className={cn(
        // Phone: one scrolling row, bleeding into the page gutter so the cards
        // can reach the screen edge, with padding that puts the first one back
        // under the heading.
        "-mx-6 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-px-6 px-6 pb-2",
        // `contain` so a sideways flick inside the rail cannot become the
        // browser's back gesture — which on iOS navigates away from the page.
        "[overscroll-behavior-x:contain] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        // Wide screen: an ordinary grid again, and nothing left over from the
        // rail — a stray `snap` or negative margin here would misalign the
        // section against every other one on the page.
        "md:mx-0 md:grid md:gap-6 md:overflow-visible md:px-0 md:pb-0",
        grid,
        // Each child becomes a snap stop that will not shrink. Applied from
        // here rather than at every call site so a new rail cannot be built
        // without them.
        "[&>*]:w-[var(--rail-card)] [&>*]:shrink-0 [&>*]:snap-start",
        "md:[&>*]:w-auto md:[&>*]:shrink",
        className,
      )}
    >
      {children}
    </div>
  );
}
