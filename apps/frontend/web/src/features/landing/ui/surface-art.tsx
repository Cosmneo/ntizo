import { useEffect, useRef } from "react";

/**
 * Stands in for a photograph until there are real ones.
 *
 * Every category tile, provider card and story on the landing page wants an
 * image, and the product has none — no stock library, no provider uploads. A
 * grey box would read as a broken page, so this paints a composed surface
 * instead: a brand-palette gradient with soft blooms and film grain.
 *
 * Deterministic from `seed`, so a tile looks the same on every render and
 * between server and client — a random fill would flicker on hydration and
 * change on every scroll-triggered repaint.
 *
 * Delete this the day images exist. It is scaffolding with a nice finish, not
 * a design decision worth keeping.
 */

/**
 * Variations in value, not in hue.
 *
 * A rainbow of tiles reads as colour swatches on a page whose brand is one
 * blue — the eye sees six decisions instead of six photographs. Staying in the
 * navy-to-sky family keeps the grid quiet enough that the labels underneath do
 * the identifying, which is what real photography will do here later.
 */
const PALETTES: ReadonlyArray<readonly [string, string, string]> = [
  ["#5b7fb8", "#b4cdec", "#3f5f92"],
  ["#6688bf", "#c1d6f0", "#48679b"],
  ["#5274ad", "#adc7e9", "#3a5788"],
  ["#6f8fc4", "#c8dcf3", "#4f6ea3"],
  ["#5877b2", "#b8d0ee", "#42618f"],
  ["#7396c9", "#cee0f5", "#557499"],
];

/** Tiny LCG. Seeded so the same tile paints identically every time. */
function seeded(seed: number): () => number {
  let s = seed * 9301 + 49297;
  return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
}

function paint(canvas: HTMLCanvasElement, seed: number, hero: boolean) {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (!width || !height) return;

  // Capped at 2: beyond that the grain loop costs more than the sharpness is
  // worth, and a 3x hero canvas is millions of fillRect calls.
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = width * dpr;
  canvas.height = height * dpr;

  const g = canvas.getContext("2d");
  if (!g) return;
  g.scale(dpr, dpr);

  const rnd = seeded(seed + 7);
  // The hero was near-black navy into electric blue: a heavy, closed sky for
  // a page whose job is to feel approachable. Softened to mid blues, with the
  // blooms doing more of the work than the gradient.
  const [deep, light, dark] = hero
    ? (["#4a6fa8", "#a9c8ee", "#2e4c7d"] as const)
    : PALETTES[seed % PALETTES.length]!;

  const base = g.createLinearGradient(0, 0, hero ? 0 : width, height);
  base.addColorStop(0, dark);
  base.addColorStop(hero ? 0.55 : 1, deep);
  if (hero) base.addColorStop(1, "#7ba0d4");
  g.fillStyle = base;
  g.fillRect(0, 0, width, height);

  for (let i = 0; i < (hero ? 7 : 5); i++) {
    const x = rnd() * width;
    const y = hero ? height * (0.25 + rnd() * 0.7) : rnd() * height;
    const r = (hero ? 0.2 + rnd() * 0.45 : 0.28 + rnd() * 0.5) * Math.max(width, height);
    const bloom = g.createRadialGradient(x, y, 0, x, y, r);
    bloom.addColorStop(0, `${light}${hero ? "4d" : "88"}`);
    bloom.addColorStop(1, `${light}00`);
    g.fillStyle = bloom;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }

  // Grain. Without it the tiles read as flat gradients — which is exactly
  // what a placeholder must not look like.
  g.globalAlpha = 0.05;
  const grains = Math.min((width * height) / 80, 12000);
  for (let i = 0; i < grains; i++) {
    g.fillStyle = rnd() > 0.5 ? "#fff" : "#000";
    g.fillRect(rnd() * width, rnd() * height, 1.5, 1.5);
  }
  g.globalAlpha = 1;
}

export function SurfaceArt({
  seed,
  hero = false,
  className,
}: {
  seed: number;
  hero?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const repaint = () => paint(canvas, seed, hero);
    repaint();

    // ResizeObserver rather than a window listener: the tiles change size when
    // the grid reflows, not only when the window does.
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(repaint);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [seed, hero]);

  return <canvas ref={ref} aria-hidden="true" className={className} />;
}
