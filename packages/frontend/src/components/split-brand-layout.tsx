import type { ReactNode } from "react";

export interface SplitBrandLayoutProps {
  /** Brand wordmark shown at the top of the coloured panel. */
  wordmark: ReactNode;
  /** The panel's headline — what this page is for, in the user's words. */
  pitch: ReactNode;
  /** Short proof points under the pitch. */
  points: readonly ReactNode[];
  /** Ticked list (sign-up) versus one muted dot-separated line (sign-in). */
  pointsAsList?: boolean;
  /** Small print under the form column, e.g. a copyright line. */
  footnote?: ReactNode;
  children: ReactNode;
}

/**
 * Two-panel shell: a coloured brand panel beside a centred content column.
 *
 * Every string arrives as a prop and nothing here calls `useTranslation`.
 * That is the reason this can live in the UI package at all — no component
 * in here depends on i18n, and `react-i18next` is not a dependency of the
 * package. Adding one would force every future consumer to configure i18n
 * just to import a button.
 *
 * The brand panel is `hidden lg:flex`: below that width it disappears rather
 * than stacking above the content. On a phone, a screen of marketing copy
 * between the user and the form is a cost — these are pages people arrive at
 * wanting to finish, not to read.
 */
export function SplitBrandLayout({
  wordmark,
  pitch,
  points,
  pointsAsList = false,
  footnote,
  children,
}: SplitBrandLayoutProps) {
  return (
    <div className="min-h-svh grid lg:grid-cols-2 bg-[var(--color-background)]">
      <aside className="hidden lg:flex flex-col justify-center gap-6 bg-[var(--color-primary)] px-14 text-[var(--color-primary-foreground)]">
        <span className="text-4xl font-bold tracking-tight">{wordmark}</span>
        <p className="max-w-sm text-xl leading-snug">{pitch}</p>

        {pointsAsList ? (
          <ul className="mt-2 flex flex-col gap-2 text-sm opacity-90">
            {points.map((point, i) => (
              <li key={i} className="flex items-center gap-2">
                <span aria-hidden="true">✓</span>
                {point}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm opacity-80">
            {points.map((point, i) => (
              <span key={i}>
                {i > 0 ? " · " : ""}
                {point}
              </span>
            ))}
          </p>
        )}
      </aside>

      <main className="flex flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">{children}</div>
        {footnote ? (
          <p className="mt-8 text-xs opacity-60 text-[var(--color-muted-foreground)]">{footnote}</p>
        ) : null}
      </main>
    </div>
  );
}
