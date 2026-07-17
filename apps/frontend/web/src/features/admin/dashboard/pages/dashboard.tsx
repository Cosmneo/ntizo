import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@ntizo/frontend-ui";
import { useCurrentUser } from "../hooks/use-current-user";

export function DashboardPage() {
  const { t } = useTranslation("admin");
  const { data: user, isLoading } = useCurrentUser();

  if (isLoading) return <p>…</p>;
  if (!user) return null;

  return (
    <div className="max-w-3xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-[var(--color-muted-foreground)]">{t("welcome")}</p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>{user.name}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-[var(--color-muted-foreground)]">Email</dt>
            <dd>{user.email}</dd>
            <dt className="text-[var(--color-muted-foreground)]">Role</dt>
            <dd>{user.role}</dd>
            <dt className="text-[var(--color-muted-foreground)]">Status</dt>
            <dd>{user.status}</dd>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
