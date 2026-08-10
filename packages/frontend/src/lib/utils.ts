import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * `MZ` → 🇲🇿. Regional indicator symbols sit 0x1F1E6 above ASCII `A`, so a
 * two-letter region code maps straight onto the flag with no image asset and
 * no lookup table.
 *
 * Renders as letters rather than a flag on platforms without the glyphs
 * (notably Windows), so never let it carry meaning on its own — pair it with
 * the name or the code.
 */
export function regionalFlag(region: string): string {
  return String.fromCodePoint(
    ...[...region.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
  );
}
