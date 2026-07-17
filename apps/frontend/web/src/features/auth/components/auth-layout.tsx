import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@ntizo/frontend-ui";
import { NtizoIcon } from "@/shared/components/icons";

interface AuthLayoutProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}

export function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps) {
  const { t } = useTranslation("common");
  return (
    <div className="min-h-svh flex flex-col items-center justify-center bg-[var(--color-background)] px-4">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col gap-6 p-8">
          <div className="flex flex-col items-center gap-1">
            <NtizoIcon className="h-10 w-10 mb-2" />
            <h1 className="text-lg font-semibold">{title}</h1>
            <p className="text-sm text-[var(--color-muted-foreground)]">{subtitle}</p>
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
