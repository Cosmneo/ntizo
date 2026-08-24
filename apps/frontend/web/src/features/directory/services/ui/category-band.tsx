import { Link } from "@tanstack/react-router";
import { Compass, Tag, icons } from "lucide-react";
import { cn } from "@ntizo/frontend-ui";
import {
  browseSearch,
  type BrowseSearch,
} from "@/features/directory/services/domain/browse-search";

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
 *
 * Changing category keeps the search and the filters rather than clearing
 * them. Treating the band as an entirely fresh start reads well in the
 * abstract and badly in the hand: somebody who typed a word and then narrowed
 * to a category means both, and silently discarding the harder-won of the two
 * looks like the search broke.
 */
export function CategoryBand({
  categories,
  current,
  allLabel,
  label,
}: {
  categories: readonly { id: string; code: string; name: string; icon: string | null }[];
  /** Everything the URL currently says — the band changes one part of it. */
  current: BrowseSearch;
  allLabel: string;
  label: string;
}) {
  const active = current.category;
  return (
    <nav
      aria-label={label}
      className="border-b border-[var(--color-border)] bg-[var(--color-background)]"
    >
      {/* Scrolls sideways rather than wrapping to a second row: a band that
          grows taller pushes the results down by a different amount on every
          screen width, and the categories past the fold are the rarer ones. */}
      <div className="page-shell flex justify-start gap-1 overflow-x-auto py-2 lg:justify-center">
        <BandItem
          search={browseSearch(current, { category: undefined })}
          isAll
          label={allLabel}
          icon={null}
          active={!active}
        />
        {categories.map((c) => (
          <BandItem
            key={c.id}
            search={browseSearch(current, { category: c.code })}
            label={c.name}
            icon={c.icon}
            active={active === c.code}
          />
        ))}
      </div>
    </nav>
  );
}

function BandItem({
  search,
  isAll = false,
  label,
  icon,
  active,
}: {
  /** Already built by `browseSearch`, which omits the category rather than emptying it. */
  search: BrowseSearch;
  isAll?: boolean;
  label: string;
  icon: string | null;
  active: boolean;
}) {
  const Icon = iconComponent(icon, isAll);

  return (
    <Link
      to="/services"
      search={search}
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
