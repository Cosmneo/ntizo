/**
 * "Ana Rodrigues" → "AR", for the avatar chip on a testimonial.
 *
 * All that survives of `mock-content.ts`, which is why this is its own file
 * rather than a leftover export from one. That module held eight invented
 * category labels, three invented providers with invented scores and prices,
 * and four invented testimonials; every one of them now comes from the
 * database, through `categoryAll`, `providerList` and `reviewFeatured`.
 */
export function initialsOf(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0] ?? "")
    .join("")
    .replace(/\W/g, "")
    .slice(0, 2)
    .toUpperCase();
}
