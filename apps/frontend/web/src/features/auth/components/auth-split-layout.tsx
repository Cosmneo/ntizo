import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

interface AuthSplitLayoutProps {
  /** The blue panel's headline — what this page is for, in the user's words. */
  pitch: string;
  /** Short proof points under the pitch. Rendered as a list when there are ticks. */
  points: readonly string[];
  /** Whether the points are shown as a ticked list (register) or one muted line (login). */
  pointsAsList?: boolean;
  children: ReactNode;
}

/**
 * The two-panel shell for sign-in and sign-up.
 *
 * The brand panel is `hidden lg:flex`: below that width it disappears entirely
 * rather than stacking above the form. On a phone, a full screen of marketing
 * copy between the user and the password field is a cost, not a benefit — and
 * these are the two screens where someone arrives wanting to finish, not to
 * read.
 *
 * The form column keeps its own vertical centring so it is identical with and
 * without the panel.
 */
export function AuthSplitLayout({
  pitch,
  points,
  pointsAsList = false,
  children,
}: AuthSplitLayoutProps) {
  const { t } = useTranslation("common");

  return (
    <div className="min-h-svh grid lg:grid-cols-2 bg-[var(--color-background)]">
      <aside className="hidden lg:flex flex-col justify-center gap-6 bg-[var(--color-primary)] px-14 text-[var(--color-primary-foreground)]">
        <span className="text-4xl font-bold tracking-tight">ntizo</span>
        <p className="max-w-sm text-xl leading-snug">{pitch}</p>

        {pointsAsList ? (
          <ul className="mt-2 flex flex-col gap-2 text-sm opacity-90">
            {points.map((point) => (
              <li key={point} className="flex items-center gap-2">
                <span aria-hidden="true">✓</span>
                {point}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm opacity-80">{points.join(" · ")}</p>
        )}
      </aside>

      <main className="flex flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">{children}</div>
        <p className="mt-8 text-xs opacity-60 text-[var(--color-muted-foreground)]">
          {t("copyright", { year: new Date().getFullYear() })}
        </p>
      </main>
    </div>
  );
}
