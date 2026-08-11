import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { Button, Select, Sheet, SheetContent } from "@ntizo/frontend-ui";
import { ProviderStatus } from "@ntizo/shared";

/**
 * The provider queue's filters, in the same right-hand sheet the workspace's
 * people list uses.
 *
 * The status picker sat loose above the card before — a bare dropdown floating
 * over the page, which is a different control in a different place doing the
 * same job as the one next door. Somebody moving between the two zones should
 * find filters in one place, opened one way.
 *
 * Applied as they change, with no Apply button: the list is right there and
 * updates under the panel, so the result is the feedback.
 */
export function ProvidersFilterSheet({
  open,
  onOpenChange,
  status,
  onStatusChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status: string;
  onStatusChange: (status: string) => void;
}) {
  const { t } = useTranslation("admin");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full max-w-sm flex-col">
        <div className="flex items-start justify-between border-b border-[var(--color-border)] px-5 py-4">
          <h2 className="type-h3 font-semibold">{t("providersFilterTitle")}</h2>
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
              htmlFor="filter-status"
              className="type-caption font-bold tracking-[0.14em] text-[var(--color-muted-foreground)] uppercase"
            >
              {t("providersStatus")}
            </label>
            <Select
              id="filter-status"
              value={status}
              onChange={onStatusChange}
              ariaLabel={t("providersStatus")}
              options={[
                { value: "", label: t("providersAllStatuses") },
                ...Object.values(ProviderStatus).map((value) => ({
                  value,
                  label: t(`providerStatus.${value}`),
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
            disabled={status === ""}
            onClick={() => onStatusChange("")}
          >
            {t("providersClearFilters")}
          </Button>
          <Button type="button" onClick={() => onOpenChange(false)}>
            {t("close")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
