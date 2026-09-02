import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ArrowRight } from "lucide-react";
import { ACCENT } from "@/features/landing/ui/palette";
import { CompanyPage, Eyebrow, SectionHeading } from "./company-page";

/**
 * Who Ntizo is, told through what the product does — mission, the three
 * steps, four principles, two audiences. No founding year, no city, no names:
 * the owner chose (2026-09-02) not to publish them.
 */
export function AboutPage() {
  const { t } = useTranslation("company");

  return (
    <CompanyPage
      page="about"
      eyebrow={t("about.eyebrow")}
      title={
        <>
          {t("about.heading")} <span style={{ color: ACCENT }}>{t("about.headingAccent")}</span>.
        </>
      }
      lede={t("about.lede")}
    >
      <section className="page-shell py-16 md:py-20">
        <div className="grid gap-10 md:grid-cols-[1.1fr_1fr] md:gap-16">
          <div>
            <Eyebrow>{t("about.missionEyebrow")}</Eyebrow>
            <p className="font-rounded mt-4 max-w-[24ch] text-[clamp(1.6rem,3vw,2.2rem)] leading-[1.12] font-extrabold tracking-[-0.02em] text-balance">
              {t("about.missionTitle")}
            </p>
          </div>
          <div className="text-[16px] leading-relaxed text-[color:var(--l-muted)]">
            <p>{t("about.mission1")}</p>
            <p className="mt-4">{t("about.mission2")}</p>
          </div>
        </div>
      </section>

      <section className="page-shell border-t py-16 md:py-20" style={{ borderColor: "var(--l-border)" }}>
        <SectionHeading eyebrow={t("about.howEyebrow")} title={t("about.howTitle")} />
        <ol className="mt-12 grid gap-10 p-0 md:grid-cols-3">
          {(["search", "book", "pay"] as const).map((key, i) => (
            <li key={key} className="list-none">
              <span className="font-rounded text-[13px] font-extrabold tracking-[0.06em] tabular-nums" style={{ color: ACCENT }}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="font-rounded mt-3 text-[1.25rem] font-extrabold tracking-[-0.01em]">
                {t(`about.steps.${key}.title`)}
              </h3>
              <p className="mt-2 leading-relaxed text-[color:var(--l-muted)]">{t(`about.steps.${key}.body`)}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="page-shell border-t py-16 md:py-20" style={{ borderColor: "var(--l-border)" }}>
        <SectionHeading eyebrow={t("about.principlesEyebrow")} title={t("about.principlesTitle")} />
        <div
          className="mt-10 grid overflow-hidden rounded-[20px] border md:grid-cols-2"
          style={{ borderColor: "var(--l-border)", background: "var(--l-card)" }}
        >
          {(["price", "verification", "payAfter", "local"] as const).map((key, i) => (
            <article
              key={key}
              className={`border-t p-7 first:border-t-0 md:p-8 ${i % 2 === 1 ? "md:border-l" : ""} ${i < 2 ? "md:border-t-0" : ""}`}
              style={{ borderColor: "var(--l-border)" }}
            >
              <h3 className="font-rounded text-[1.15rem] font-extrabold tracking-[-0.01em]">
                {t(`about.principles.${key}.title`)}
              </h3>
              <p className="mt-2 leading-relaxed text-[color:var(--l-muted)]">{t(`about.principles.${key}.body`)}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="page-shell border-t py-16 md:py-20" style={{ borderColor: "var(--l-border)" }}>
        <div className="grid gap-5 md:grid-cols-2">
          <Audience
            eyebrow={t("about.customersEyebrow")}
            title={t("about.customersTitle")}
            body={t("about.customersBody")}
            cta={t("about.customersCta")}
            to="/services"
            primary
          />
          <Audience
            eyebrow={t("about.providersEyebrow")}
            title={t("about.providersTitle")}
            body={t("about.providersBody")}
            cta={t("about.providersCta")}
            to="/become-provider"
          />
        </div>
      </section>
    </CompanyPage>
  );
}

function Audience({
  eyebrow, title, body, cta, to, primary = false,
}: { eyebrow: string; title: string; body: string; cta: string; to: string; primary?: boolean }) {
  return (
    <article className="rounded-[20px] border p-7 md:p-8" style={{ borderColor: "var(--l-border)", background: "var(--l-card)" }}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h3 className="font-rounded mt-3 text-[clamp(1.3rem,2.2vw,1.6rem)] font-extrabold tracking-[-0.02em]">{title}</h3>
      <p className="mt-3 leading-relaxed text-[color:var(--l-muted)]">{body}</p>
      <Link
        to={to}
        className={`font-rounded mt-6 inline-flex items-center gap-2 rounded-full px-6 py-3 text-[14px] font-extrabold no-underline ${
          primary ? "text-white" : "border"
        }`}
        style={primary ? { background: ACCENT } : { borderColor: "rgba(19,23,27,.25)", color: "inherit" }}
      >
        {cta}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </article>
  );
}
