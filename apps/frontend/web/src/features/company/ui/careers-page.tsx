import { useTranslation } from "react-i18next";
import { ArrowRight } from "lucide-react";
import { ACCENT } from "@/features/landing/ui/palette";
import { CONTACT } from "@/shared/lib/contact";
import { CompanyPage, Eyebrow } from "./company-page";

interface Principle {
  title: string;
  body: string;
}

/**
 * No open roles, said plainly, and a spontaneous application by email. The
 * three "how we work" sentences are the only copy on the four pages not
 * derived from the code; the owner approved them.
 */
export function CareersPage() {
  const { t } = useTranslation("company");
  const how = t("careers.how", { returnObjects: true }) as Principle[] | string;
  const mailto = `mailto:${CONTACT.general}?subject=${encodeURIComponent(t("careers.mailSubject"))}`;

  return (
    <CompanyPage page="careers" eyebrow={t("careers.eyebrow")} title={t("careers.heading")} lede={t("careers.lede")}>
      <section className="page-shell py-16 md:py-20">
        <div className="grid gap-12 md:grid-cols-2 md:gap-16">
          <div>
            <Eyebrow>{t("careers.buildingEyebrow")}</Eyebrow>
            <p className="mt-4 text-[16px] leading-relaxed text-[color:var(--l-muted)]">{t("careers.building1")}</p>
            <p className="mt-4 text-[16px] leading-relaxed text-[color:var(--l-muted)]">{t("careers.building2")}</p>
          </div>
          <div>
            <Eyebrow>{t("careers.howEyebrow")}</Eyebrow>
            <ul className="mt-4 grid gap-5 p-0">
              {Array.isArray(how) &&
                how.map((p) => (
                  <li key={p.title} className="list-none">
                    <h3 className="font-rounded text-[1.1rem] font-extrabold tracking-[-0.01em]">{p.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-[color:var(--l-muted)]">{p.body}</p>
                  </li>
                ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="page-shell pb-16 md:pb-20">
        <div
          className="flex flex-col gap-6 rounded-[20px] border p-7 md:flex-row md:items-center md:justify-between md:p-8"
          style={{ borderColor: "var(--l-border)", background: "var(--l-card)" }}
        >
          <div>
            <Eyebrow>{t("careers.openingsEyebrow")}</Eyebrow>
            <h2 className="font-rounded mt-3 text-[clamp(1.4rem,2.4vw,1.8rem)] font-extrabold tracking-[-0.02em]">
              {t("careers.openingsTitle")}
            </h2>
            <p className="mt-3 max-w-[56ch] leading-relaxed text-[color:var(--l-muted)]">{t("careers.openingsBody")}</p>
          </div>
          <a
            href={mailto}
            className="font-rounded inline-flex shrink-0 items-center gap-2 rounded-full px-7 py-3.5 text-[15px] font-extrabold text-white no-underline"
            style={{ background: ACCENT }}
          >
            {t("careers.openingsCta")}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>
        <p className="mt-3 text-right text-sm text-[color:var(--l-muted)]">
          {t("careers.openingsHint", { email: CONTACT.general })}
        </p>
      </section>
    </CompanyPage>
  );
}
