import { useId } from "react";
import { cn } from "@ntizo/frontend-ui";

/**
 * The Ntizo mark, drawn rather than fetched.
 *
 * `public/brand/icon-primary.svg` and `icon-white.svg` are the same two shapes
 * in two colourways, and an `<img>` pointing at one of them cannot follow the
 * theme: the choice would have to be made in JavaScript, after the theme has
 * resolved, which puts the wrong logo on screen for a frame and costs a second
 * network request to correct. Inline, the `dark:` variant does it in CSS and
 * there is no moment where either is wrong.
 *
 * The navy fill is a literal rather than a token on purpose — it is the
 * brand's colour, not the interface's, and it must not shift if the palette
 * ever does. What the theme changes is which colourway is drawn, not the
 * colours themselves.
 */

/** The figure. Drawn twice in light: navy underneath, gradient over it. */
const FIGURE =
  "M729.327 579.543L692.23 937.437L750.515 995.722L808.801 937.437L771.697 579.543L805.323 545.918C823.198 550.905 842.231 558.158 863.469 567.699L972.431 1295.06H527.569L636.531 567.699C658.043 557.933 677.291 550.576 695.375 545.592L729.327 579.543Z";

/** The head. */
const HEAD =
  "M749.998 488.215C712.443 488.215 679.18 474.266 650.209 446.368C622.311 417.397 608.362 384.134 608.362 346.579C608.362 306.878 622.311 273.615 650.209 246.79C679.18 218.892 712.443 204.943 749.998 204.943C788.626 204.943 821.889 218.892 849.787 246.79C877.685 273.615 891.634 306.878 891.634 346.579C891.634 384.134 877.685 417.397 849.787 446.368C821.889 474.266 788.626 488.215 749.998 488.215Z";

export function BrandMark({ className }: { className?: string }) {
  // A gradient is referenced by fragment id, so two marks on one page with the
  // same id would have the second silently inherit the first's definition.
  // `useId` is unique per instance; the strip is because React's format
  // contains colons, which a `url(#…)` reference cannot carry safely.
  const gradientId = `ntizo-mark-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  return (
    <svg
      viewBox="527.6 204.9 444.9 1090.1"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      className={cn("w-auto", className)}
    >
      <defs>
        <linearGradient
          id={gradientId}
          x1="2540.23"
          y1="826.639"
          x2="-908.16"
          y2="826.639"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#38B6FF" />
          <stop offset="1" stopColor="#007AFF" />
        </linearGradient>
      </defs>
      <path d={FIGURE} className="fill-[#00244D] dark:fill-white" />
      {/* Hidden in dark rather than recoloured: the gradient runs from #38B6FF
          to #007AFF, and both disappear into a #161a23 ground. What is left
          underneath is the white figure, which is the dark colourway exactly
          as the shipped asset draws it. */}
      <path d={FIGURE} fill={`url(#${gradientId})`} className="dark:hidden" />
      <path d={HEAD} className="fill-[#00244D] dark:fill-white" />
    </svg>
  );
}
