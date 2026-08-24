import * as React from "react";

/**
 * Two stacked `<circle>`s rather than `conic-gradient` or a canvas draw: the
 * arc is plain SVG `stroke-dasharray`/`stroke-dashoffset`, so it scales
 * losslessly at any `size`, needs no vendor prefix, and would animate for
 * free from a CSS transition on `stroke-dashoffset` if a caller ever wants
 * that — nothing here forecloses it.
 *
 * The count in the middle is a real `<span>` layered over the SVG, not an
 * SVG `<text>` node inside it, so it is still there if the SVG fails to
 * draw at all — the same "keep the meaningful part in the DOM, not only in
 * the graphic" reasoning `choice-chips.tsx` gives for its native inputs.
 *
 * `role="img"` with `label` as the accessible name presents the ring as one
 * picture, not two independently-meaningful shapes: the circles themselves
 * carry no ARIA, so a screen reader says the sentence in `label` once
 * instead of announcing two anonymous graphics.
 *
 * `total === 0` reads as complete rather than falling through to `0 / 0`: a
 * screen with no required sections has nothing left to finish, and NaN in a
 * `stroke-dashoffset` is not a legible way to say so. `done` is clamped into
 * `[0, total]` so a caller's bug two layers up — an off-by-one completion
 * count — draws a full ring instead of one that winds back past itself.
 */
export function ProgressRing({
  done,
  total,
  label,
  size = 64,
}: {
  done: number;
  total: number;
  /** Accessible label, e.g. "2 of 3 required sections done". */
  label: string;
  size?: number;
}) {
  const strokeWidth = size / 10;
  const radius = size / 2 - strokeWidth / 2;
  const circumference = 2 * Math.PI * radius;

  const isComplete = total === 0;
  const clampedDone = isComplete ? 0 : Math.min(Math.max(done, 0), total);
  const fraction = isComplete ? 1 : clampedDone / total;
  const dashoffset = circumference * (1 - fraction);

  return (
    <div
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg
        role="img"
        aria-label={label}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashoffset}
        />
      </svg>
      <span
        aria-hidden="true"
        className="type-h3 absolute text-[var(--color-foreground)]"
      >
        {clampedDone}
      </span>
    </div>
  );
}
