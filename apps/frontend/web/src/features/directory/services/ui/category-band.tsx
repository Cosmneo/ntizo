import { Link } from "@tanstack/react-router";
import { Compass, Tag, icons } from "lucide-react";
import { cn } from "@ntizo/frontend-ui";

/**
 * The categories, as a band across the top of the browse.
 *
 * Centred and full-bleed rather than a row of chips in the page's own column,
 * because it is navigation between whole result sets — the same weight as the
 * site header above it — not one control among several inside the results.
 * The filters in the sidebar narrow a list; this changes which list.
 *
 * Icons come from the category's own `icon` column, which stores a Lucide
 * name for exactly this: "the places too small to carry the image". The
 * landing page uses `imageUrl` instead, and should — a tile has room for a
 * photograph and this does not.
 */
export function CategoryBand({
  categories,
  active,
  allLabel,
  label,
}: {
  categories: readonly { id: string; code: string; name: string; icon: string | null }[];
  /** The selected category's code, or undefined for "all". */
  active: string | undefined;
  allLabel: string;
  label: string;
}) {
  return (
    <nav
      aria-label={label}
      className="border-b border-[var(--color-border)] bg-[var(--color-background)]"
    >
      {/* Scrolls sideways rather than wrapping to a second row: a band that
          grows taller pushes the results down by a different amount on every
          screen width, and the categories past the fold are the rarer ones. */}
      <div className="page-shell flex justify-start gap-1 overflow-x-auto py-2 lg:justify-center">
        <BandItem to={undefined} label={allLabel} icon={null} active={!active} />
        {categories.map((c) => (
          <BandItem key={c.id} to={c.code} label={c.name} icon={c.icon} active={active === c.code} />
        ))}
      </div>
    </nav>
  );
}

function BandItem({
  to,
  label,
  icon,
  active,
}: {
  to: string | undefined;
  label: string;
  icon: string | null;
  active: boolean;
}) {
  const Icon = iconComponent(icon, to === undefined);

  return (
    <Link
      to="/services"
      // The absence of the param, not a magic value — so `/services` and
      // `/services?category=` never become two spellings of one page.
      search={to ? { category: to } : {}}
      className={cn(
        "grid shrink-0 justify-items-center gap-1 rounded-[var(--radius-card-sm)] px-3.5 py-2 transition-colors",
        active
          ? "text-[var(--color-primary)]"
          : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]",
      )}
    >
      <Icon className="h-5 w-5" aria-hidden="true" />
      <span className="type-caption whitespace-nowrap">{label}</span>
      {/* The underline is the selected state, drawn always so the row does not
          shift by two pixels when the selection moves. */}
      <span
        aria-hidden="true"
        className={cn("h-0.5 w-full rounded-full", active ? "bg-[var(--color-primary)]" : "bg-transparent")}
      />
    </Link>
  );
}

/**
 * A Lucide name from the database, resolved to the component.
 *
 * Looked up rather than imported one by one: the set lives in a table an
 * administrator edits, so the code cannot know it at build time. An unknown
 * or missing name falls back to a tag rather than rendering nothing — a band
 * with a hole in it reads as a broken row, not as a category without an icon.
 */
function iconComponent(name: string | null, isAll: boolean) {
  if (isAll) return Compass;
  if (!name) return Tag;
  const key = name as keyof typeof icons;
  return icons[key] ?? Tag;
}
