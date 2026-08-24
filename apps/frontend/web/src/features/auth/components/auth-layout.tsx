import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@ntizo/frontend-ui";
import { NtizoMark } from "@/shared/components/icons";

interface AuthLayoutProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
  /**
   * Replaces the default brand mark with a page-specific glyph in a tinted
   * circle — a padlock for password reset, a message bubble for OTP. On these
   * screens the icon says what is about to happen, which the logo does not.
   */
  icon?: ReactNode;
}

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
  icon,
}: AuthLayoutProps) {
  const { t } = useTranslation("common");
  return (
    <div className="min-h-svh flex flex-col items-center justify-center bg-[var(--color-background)] px-4">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col gap-6 p-8">
          <div className="flex flex-col items-center gap-1">
            <span className="mb-3 text-2xl font-bold tracking-tight text-[var(--color-primary)]">
              ntizo
            </span>
            {icon ? (
              <div className="mb-3 rounded-full bg-[var(--color-secondary)] p-3">
                {icon}
              </div>
            ) : (
              <NtizoMark className="mb-2 h-10 w-auto" />
            )}
            <h1 className="text-lg font-semibold">{title}</h1>
            <p className="text-sm text-[var(--color-muted-foreground)]">
              {subtitle}
            </p>
          </div>
          {children}
          <p className="text-center text-sm text-[var(--color-muted-foreground)]">
            {footer}
          </p>
        </CardContent>
      </Card>
      <p className="text-xs text-[var(--color-muted-foreground)] mt-6 opacity-60">
        {t("copyright", { year: new Date().getFullYear() })}
      </p>
    </div>
  );
}
