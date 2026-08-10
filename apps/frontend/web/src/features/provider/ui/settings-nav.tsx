import { useEffect, useState } from "react";
import { cn } from "@ntizo/frontend-ui";

export interface SettingsSection {
  id: string;
  label: string;
  icon: React.ReactNode;
  /** Drives the unsaved dot. */
  dirty?: boolean;
  tone?: "danger";
}

/**
 * Which section is on screen.
 *
 * `IntersectionObserver` with a top-heavy root margin rather than a scroll
 * handler doing arithmetic: the browser already knows where these elements
 * are, and asking it costs nothing per frame. The margin pulls the trigger
 * line to roughly a quarter down the viewport so a heading becomes "current"
 * when you arrive at it, not when it is about to leave.
 */
function useCurrentSection(ids: readonly string[]): string | null {
  const [current, setCurrent] = useState<string | null>(ids[0] ?? null);

  // A string, not the array. `sections.map(...)` allocates a fresh array on
  // every render, so an array dependency re-ran this effect on every render —
  // and because the effect sets state, each run scheduled the next. It
  // converged, but it tore the observer down and rebuilt it continuously for
  // no reason. A joined key changes only when the sections do.
  const key = ids.join(",");

  useEffect(() => {
    const ids = key.split(",");
    const elements = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (elements.length === 0) return;

    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        // The first in document order among those on screen — scrolling down
        // past a section boundary should advance, not jump to whichever
        // observer callback fired last.
        const first = ids.find((id) => visible.has(id));
        if (first) setCurrent(first);
      },
      { rootMargin: "-25% 0px -60% 0px" },
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [key]);

  return current;
}

/**
 * The rail beside the settings form.
 *
 * Anchor links, not tabs or routes. Every section stays rendered and
 * scrollable, which is what makes the single save bar at the bottom honest —
 * it saves the whole page, so the whole page has to be reachable without
 * losing an edit made three sections up.
 *
 * Hidden below `lg`, where the sections simply stack: a nav rail that eats a
 * third of a phone screen to save two thumb-flicks is not a trade worth
 * making.
 */
export function SettingsNav({
  sections,
  title,
}: {
  sections: readonly SettingsSection[];
  title: string;
}) {
  const ids = sections.map((s) => s.id);
  const current = useCurrentSection(ids);

  return (
    <nav aria-label={title} className="hidden lg:block">
      <div className="sticky top-6">
        <p className="type-caption px-3 font-bold tracking-[0.14em] text-[var(--color-muted-foreground)] uppercase">
          {title}
        </p>
        <ul className="mt-3 grid gap-0.5">
          {sections.map((section) => {
            const active = current === section.id;
            return (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "type-body flex items-center gap-2.5 rounded-[var(--radius-field)] px-3 py-2 transition-colors",
                    active
                      ? "bg-[var(--color-muted)] font-semibold text-[var(--color-foreground)]"
                      : "text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]/60 hover:text-[var(--color-foreground)]",
                    section.tone === "danger" && "text-[var(--color-destructive)]",
                  )}
                >
                  <span className="shrink-0 opacity-80">{section.icon}</span>
                  <span className="min-w-0 flex-1 truncate">{section.label}</span>
                  {section.dirty && (
                    // The one thing this rail knows that the headings don't:
                    // where the unsaved edit is, when it has been scrolled off.
                    <span
                      aria-hidden
                      className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-primary)]"
                    />
                  )}
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
