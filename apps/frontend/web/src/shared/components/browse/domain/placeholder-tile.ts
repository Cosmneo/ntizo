/**
 * A stable hue for a listing with no photograph.
 *
 * Most listings on this platform have no photograph — the placeholder is the
 * common case, not the exception — and a column of identical grey rectangles
 * reads as a page that failed to load, where a column of different tiles reads
 * as a catalogue.
 *
 * Seeded on the category code rather than on the listing's id so a trade looks
 * the same wherever it appears. An id would give one plumber a purple tile and
 * the next a green one, which tells the reader nothing and makes the browse
 * look arbitrary rather than organised.
 *
 * FNV-1a rather than the usual `h * 31 + c`: the latter clusters badly on
 * short lowercase ASCII strings, which is exactly what a category code is, and
 * adjacent codes came out adjacent on the wheel.
 */
export function placeholderHue(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    // `Math.imul` rather than `*`: the product overflows 2^53 and JavaScript
    // starts dropping low bits, which is where a hash's entropy lives.
    h = Math.imul(h, 0x01000193);
  }
  // `>>> 0` first: the operations above leave a signed 32-bit value, and a
  // negative modulo would return a negative hue.
  return (h >>> 0) % 360;
}

/**
 * Up to two initials from a name.
 *
 * `Intl.Segmenter` rather than `name[0]`, and the same reasoning the directory's
 * first provider card documented before this file existed (and inherited it
 * when that card was replaced): a name beginning with an emoji, an accented
 * letter formed from two code points, or a script outside the BMP is cut
 * mid-character by an index and renders as a replacement box — on the very
 * tiles that exist to stop a listing looking broken.
 */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (words.length === 0) return "?";
  return words
    .map((word) => {
      if (typeof Intl.Segmenter === "function") {
        const [first] = new Intl.Segmenter().segment(word);
        return first?.segment ?? "";
      }
      return [...word][0] ?? "";
    })
    .join("")
    .toUpperCase();
}
