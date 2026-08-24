/**
 * Two letters standing in for a name.
 *
 * Shared so the workspace's people list and the admin's provider queue derive
 * them the same way — they sit in the same avatar, in the same card, and
 * "Estúdio Teste" reading as ET in one and ES in the other is the kind of
 * difference nobody reports and everybody notices.
 *
 * Splits on spaces, `@` and `.` so an email works as well as a name: with no
 * name to show, `bernardo.cabral@outlook.com` gives BC rather than BE.
 */
export function initialsFrom(source: string): string {
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  // One word gives two of its own letters. One letter alone in a 36px circle
  // reads as a bullet rather than a monogram — which is what "teste" produced
  // for every one of the seeded workspaces.
  const letters =
    parts.length === 1
      ? parts[0]!.slice(0, 2)
      : parts[0]![0]! + parts[1]![0]!;
  return letters.toUpperCase();
}
