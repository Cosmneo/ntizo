import { BrandTile } from "@/shared/components/browse/brand-tile";

/**
 * Three photographs of the work, at two scales.
 *
 * Ntizo owns none yet, so all three draw the brand tile — the same designed
 * empty state every listing uses. When the company has photographs, they
 * replace `SLOTS` and nothing else here changes.
 *
 * The names are what the tile prints when it has no picture, so the empty
 * state still says which trades this marketplace is for.
 */
const SLOTS = [
  { name: "Pintura", className: "row-span-2" },
  { name: "Beleza", className: "" },
  { name: "Carpintaria", className: "" },
] as const;

export function HeroCollage() {
  return (
    <div
      aria-hidden="true"
      className="grid h-[360px] grid-cols-[1.15fr_1fr] grid-rows-2 gap-3 lg:h-[520px]"
    >
      {SLOTS.map((slot) => (
        <div
          key={slot.name}
          className={`relative overflow-hidden rounded-[20px] bg-[var(--color-navy-surface)] ${slot.className}`}
        >
          <BrandTile name={slot.name} />
        </div>
      ))}
    </div>
  );
}
