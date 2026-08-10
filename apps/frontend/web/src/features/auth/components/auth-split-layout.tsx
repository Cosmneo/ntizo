import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { SplitBrandLayout } from "@ntizo/frontend-ui";

interface AuthSplitLayoutProps {
  pitch: string;
  points: readonly string[];
  pointsAsList?: boolean;
  children: ReactNode;
}

/**
 * Thin adapter: supplies the wordmark, the footnote and the translations to
 * the package's `SplitBrandLayout`.
 *
 * The layout itself is i18n-agnostic on purpose — `useTranslation` lives here,
 * in the app, so the UI package stays free of a react-i18next dependency.
 */
export function AuthSplitLayout({ pitch, points, pointsAsList, children }: AuthSplitLayoutProps) {
  const { t } = useTranslation("common");
  return (
    <SplitBrandLayout
      wordmark="ntizo"
      pitch={pitch}
      points={points}
      pointsAsList={pointsAsList}
      footnote={t("copyright", { year: new Date().getFullYear() })}
    >
      {children}
    </SplitBrandLayout>
  );
}
