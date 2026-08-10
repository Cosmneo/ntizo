import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Clock, LayoutGrid } from "lucide-react";
import { Button } from "@ntizo/frontend-ui";
import { HeroQuestion } from "@/features/onboarding/ui/wizard-chrome";

/**
 * The end of the wizard: the application is in.
 *
 * Not a celebration. The reference finishes with confetti because its operator
 * is live at that moment; ours is `pending` and cannot be found by a customer
 * until an administrator approves it, so a party here would be telling someone
 * they have something they do not.
 *
 * What it does instead is say what happens next and hand over a real thing to
 * do, because the workspace is usable while the application waits.
 */
export function PhaseReview({ providerName }: { providerName: string }) {
  const { t } = useTranslation("onboarding");

  return (
    <div className="text-center">
      <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[color-mix(in_srgb,var(--color-warning)_16%,transparent)]">
        <Clock className="h-7 w-7 text-[var(--color-warning)]" />
      </span>

      <div className="mt-6">
        <HeroQuestion title={t("review.title", { name: providerName })} />
      </div>

      <p className="type-body mx-auto -mt-4 max-w-[52ch] text-[var(--color-muted-foreground)]">
        {t("review.body")}
      </p>

      <ul className="mx-auto mt-8 grid max-w-[46ch] list-none gap-3 p-0 text-left">
        {["profile", "services", "team"].map((key) => (
          <li
            key={key}
            className="type-body flex items-start gap-3 rounded-[var(--radius-card-sm)] bg-[var(--color-muted)] px-4 py-3"
          >
            <LayoutGrid className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-primary)]" />
            {t(`review.meanwhile.${key}`)}
          </li>
        ))}
      </ul>

      <div className="mt-9">
        <Link to="/provider/overview">
          <Button>{t("review.cta")}</Button>
        </Link>
      </div>
    </div>
  );
}
