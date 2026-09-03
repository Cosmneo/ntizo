import { useTranslation } from "react-i18next";
import { ChevronLeft, X } from "lucide-react";
import { Sheet, SheetContent } from "@ntizo/frontend-ui";
import type { ReactNode } from "react";

const TITLE_ID = "help-center-title";

/**
 * The panel itself: a right-hand sheet on a desktop, the same sheet full
 * width on a phone.
 *
 * `Sheet` since Task 1 is a real dialog — focus goes in, Escape closes,
 * focus comes back — so this component only decides the frame and the
 * header, not the modality.
 */
export function HelpPanel({
  open,
  onOpenChange,
  canGoBack,
  onBack,
  children,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  canGoBack: boolean;
  onBack: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation("help");
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        labelledBy={TITLE_ID}
        className="flex w-full flex-col sm:w-[26rem]"
      >
        <div className="flex items-start justify-between gap-3 bg-[var(--color-primary)] px-4 py-4 text-[var(--color-primary-foreground)]">
          <div className="flex items-center gap-2">
            {canGoBack && (
              <button type="button" onClick={onBack} aria-label={t("back")}>
                <ChevronLeft className="h-5 w-5" />
              </button>
            )}
            <div>
              <h2 id={TITLE_ID} className="type-h3 font-semibold">
                {t("title")}
              </h2>
              <p className="type-caption opacity-90">{t("greeting")}</p>
            </div>
          </div>
          <button type="button" onClick={() => onOpenChange(false)} aria-label={t("close")}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
