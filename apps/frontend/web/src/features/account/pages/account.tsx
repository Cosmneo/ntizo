import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@ntizo/frontend-ui";
import { usePageHeader } from "@/shared/lib/page-header";
import { useCurrentUser } from "../hooks/use-current-user";

export function AccountPage() {
  const { t } = useTranslation("provider");
  const { data: user, isLoading } = useCurrentUser();

  usePageHeader(t("nav.myAccount"), user?.email);

  if (isLoading) return <p>…</p>;
  if (!user) return null;

  return (
    <div className="max-w-2xl">
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
