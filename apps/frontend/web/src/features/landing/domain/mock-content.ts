/**
 * Stand-in content for the landing page.
 *
 * None of this exists in the backend yet: there is no Service aggregate, no
 * categories, no reviews. Kept in one file, typed, and read only by the
 * landing's UI so that replacing it with real queries is a change to where the
 * data comes from — not a rewrite of how the page is built.
 *
 * Labels are translation keys rather than strings, so the page follows a
 * language change like everything else. Numbers stay here because a rating and
 * a price are data, not copy.
 */

export interface MockCategory {
  /** Key under the `landing` namespace, e.g. `cat.plumbing`. */
  labelKey: string;
}

export interface MockProvider {
  id: string;
  name: string;
  /** Key under `landing`, e.g. `role.electrician`. */
  roleKey: string;
  rating: number;
  reviews: number;
  city: string;
  /** Minor-unit-free MZN amount, formatted at render with the active locale. */
  fromPrice: number;
  /** `landing` key for the badge, or null for no badge. */
  badgeKey: string | null;
  badgeTone: "recommended" | "top" | null;
}

export interface MockStory {
  id: string;
  /** `landing` keys — both the headline and the quote are copy. */
  titleKey: string;
  quoteKey: string;
  author: string;
}

export const MOCK_CATEGORIES: readonly MockCategory[] = [
  { labelKey: "cat.plumbing" },
  { labelKey: "cat.electrical" },
  { labelKey: "cat.cleaning" },
  { labelKey: "cat.mechanic" },
  { labelKey: "cat.cooking" },
  { labelKey: "cat.delivery" },
  { labelKey: "cat.building" },
  { labelKey: "cat.driving" },
];

export const MOCK_PROVIDERS: readonly MockProvider[] = [
  {
    id: "m-1",
    name: "Flávio Magalhães",
    roleKey: "role.photographer",
    rating: 4.3,
    reviews: 130,
    city: "Maputo, Malhazine",
    fromPrice: 350,
    badgeKey: "badgeRecommended",
    badgeTone: "recommended",
  },
  {
    id: "m-2",
    name: "Carla Machava",
    roleKey: "role.designer",
    rating: 4.6,
    reviews: 98,
    city: "Maputo, Matola",
    fromPrice: 300,
    badgeKey: null,
    badgeTone: null,
  },
  {
    id: "m-3",
    name: "João Nhantumbo",
    roleKey: "role.electrician",
    rating: 4.8,
    reviews: 210,
    city: "Maputo, Malhazine",
    fromPrice: 450,
    badgeKey: "badgeTopRated",
    badgeTone: "top",
  },
];

export const MOCK_STORIES: readonly MockStory[] = [
  { id: "s-1", titleKey: "story.leak", quoteKey: "story.leakQuote", author: "Ana R." },
  { id: "s-2", titleKey: "story.wiring", quoteKey: "story.wiringQuote", author: "Paulo M." },
  { id: "s-3", titleKey: "story.office", quoteKey: "story.officeQuote", author: "Inês T." },
  { id: "s-4", titleKey: "story.tutoring", quoteKey: "story.tutoringQuote", author: "Sérgio C." },
];

/** "Ana R." → "AR", for the avatar chip on a story. */
export function initialsOf(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0] ?? "")
    .join("")
    .replace(/\W/g, "")
    .slice(0, 2)
    .toUpperCase();
}
