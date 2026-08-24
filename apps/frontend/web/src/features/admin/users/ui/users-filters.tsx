import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { Button, Select, Sheet, SheetContent } from "@ntizo/frontend-ui";
import { USER_ROLES } from "@ntizo/shared";

/**
 * The user list's filters, in the same right-hand sheet the provider queue and
 * the workspace's people list use.
 *
 * Role only. Status is in the list and worth seeing, but it is not what
 * anybody narrows by — the question that brings somebody here is "show me the
 * providers" or "show me the admins", and a filter nobody reaches for is one
 * more control between them and the list.
 */
export function UsersFilterSheet({
  open,
  onOpenChange,
  role,
  onRoleChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: string;
  onRoleChange: (role: string) => void;
}) {
  const { t } = useTranslation("admin");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full max-w-sm flex-col">
        <div className="flex items-start justify-between border-b border-[var(--color-border)] px-5 py-4">
          <h2 className="type-h3 font-semibold">{t("usersFilterTitle")}</h2>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label={t("close")}
            className="grid h-8 w-8 place-items-center rounded-full text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid flex-1 content-start gap-5 overflow-y-auto p-5">
          <div className="grid gap-1.5">
            <label
              htmlFor="filter-role"
              className="type-caption font-bold tracking-[0.14em] text-[var(--color-muted-foreground)] uppercase"
            >
              {t("usersRole")}
            </label>
            <Select
              id="filter-role"
              value={role}
              onChange={onRoleChange}
              ariaLabel={t("usersRole")}
              options={[
                { value: "", label: t("usersAllRoles") },
                ...USER_ROLES.map((value) => ({
                  value,
                  label: t(`userRole.${value}`),
                })),
              ]}
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-[var(--color-border)] px-5 py-4">
          {/* Only live when it would do something. The search box is left alone
              — it lives outside this panel, in sight, and clearing something
              the reader cannot see from here is worse than leaving it. */}
          <Button
            type="button"
            variant="ghost"
            disabled={role === ""}
            onClick={() => onRoleChange("")}
          >
            {t("usersClearFilters")}
          </Button>
          <Button type="button" onClick={() => onOpenChange(false)}>
            {t("close")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
