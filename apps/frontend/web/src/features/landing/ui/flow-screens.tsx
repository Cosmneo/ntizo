import { useTranslation } from "react-i18next";
import { Check, Search, Star } from "lucide-react";
import { BrandTile } from "@/shared/components/browse/brand-tile";

/**
 * The three moments, drawn rather than screenshotted.
 *
 * Sample content — the service names, the business, the address — is
 * deliberately Mozambican and deliberately untranslated: it stands in for one
 * provider's real listing, the way a quoted review stands in for one
 * customer's words. Only the interface chrome around it takes a translation
 * key, because an English reader looking at a Portuguese app is being shown
 * somebody else's product.
 */

/** One row of the results screen. */
function Row({ name, provider, price, minutes }: {
  name: string;
  provider: string;
  price: string;
  minutes: string;
}) {
  return (
    <div className="grid grid-cols-[56px_minmax(0,1fr)] items-center gap-3 border-t border-[var(--color-border)] py-2.5 first:border-t-0 first:pt-0.5">
      <span className="aspect-square overflow-hidden rounded-lg bg-[var(--color-navy-surface)]">
        <BrandTile name={provider} />
      </span>
      <span className="min-w-0">
        <b className="block truncate text-[12.5px] font-semibold">{name}</b>
        <span className="flex items-center gap-1 text-[11px] text-[var(--color-muted-foreground)]">
          {provider}
          <Star className="h-2.5 w-2.5 fill-[var(--color-warning)] text-[var(--color-warning)]" aria-hidden="true" />
          4,7
        </span>
        <span className="mt-0.5 block text-[12.5px] font-bold text-[var(--color-headline)]">
          {price}
          <span className="ml-1.5 text-[11px] font-medium text-[var(--color-muted-foreground)]">
            {minutes}
          </span>
        </span>
      </span>
    </div>
  );
}

export function FindScreen() {
  const { t } = useTranslation("landing"); // t:FindScreen
  return (
    <div className="grid content-start gap-3 p-3.5 text-[12.5px]">
      <span className="flex h-9 items-center gap-2 rounded-full border border-[var(--color-border)] px-3">
        <Search className="h-3.5 w-3.5 text-[var(--color-headline)]" aria-hidden="true" />
        <b className="text-[12.5px] font-semibold">Beleza e cabelo</b>
      </span>
      <div>
        <Row name="Corte de cabelo" provider="Estúdio Mavalane" price="800 MZN" minutes="45 min" />
        <Row name="Escova e brushing" provider="Estúdio Mavalane" price="1 100 MZN" minutes="70 min" />
        <Row name="Maquilhagem" provider="Studio Glam" price="1 500 MZN" minutes="90 min" />
        <Row name="Manicure com gel" provider="Nádia Macuácua" price="650 MZN" minutes="60 min" />
      </div>
      <p className="border-t border-[var(--color-border)] pt-3 text-center text-xs font-semibold text-[var(--color-headline)]">
        {t("home.flowMore", { count: 12 })}
      </p>
    </div>
  );
}

export function BookScreen() {
  const { t } = useTranslation("landing"); // t:BookScreen
  const days = [
    { day: "Qui", n: "10" },
    { day: "Sex", n: "11" },
    { day: "Sáb", n: "12", on: true },
    { day: "Dom", n: "13" },
  ];
  const slots = [
    { at: "09:00", off: true },
    { at: "10:30" },
    { at: "14:00", on: true },
    { at: "15:30" },
    { at: "17:00" },
  ];
  return (
    <div className="grid content-start gap-3 p-3.5 text-[12.5px]">
      <div className="grid grid-cols-[52px_minmax(0,1fr)] items-center gap-3">
        <span className="aspect-square overflow-hidden rounded-lg bg-[var(--color-navy-surface)]">
          <BrandTile name="Estúdio Mavalane" />
        </span>
        <span>
          <b className="block text-[13px] font-bold">Corte de cabelo</b>
          <span className="text-[11.5px] text-[var(--color-muted-foreground)]">
            Estúdio Mavalane · Polana
          </span>
        </span>
      </div>
      <div className="flex gap-1.5">
        {days.map((d) => (
          <span
            key={d.n}
            className={
              d.on
                ? "flex-1 rounded-lg border border-[var(--color-navy-surface)] bg-[var(--color-navy-surface)] py-1.5 text-center text-[11px] leading-tight text-[var(--color-navy-on)]/70"
                : "flex-1 rounded-lg border border-[var(--color-border)] py-1.5 text-center text-[11px] leading-tight text-[var(--color-muted-foreground)]"
            }
          >
            {d.day}
            <b className={d.on ? "block text-[13px] font-bold text-[var(--color-navy-on)]" : "block text-[13px] font-bold text-[var(--color-foreground)]"}>
              {d.n}
            </b>
          </span>
        ))}
      </div>
      <p className="text-[11px] font-semibold text-[var(--color-muted-foreground)]">
        {t("home.flowHours", { minutes: 45 })}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {slots.map((s) => (
          <span
            key={s.at}
            className={
              s.on
                ? "rounded-lg border border-[var(--color-navy-surface)] bg-[var(--color-navy-surface)] px-2.5 py-2 text-xs font-semibold text-[var(--color-navy-on)]"
                : s.off
                  ? "rounded-lg border border-dashed border-[var(--color-border)] px-2.5 py-2 text-xs font-semibold text-[var(--color-muted-foreground)] line-through"
                  : "rounded-lg border border-[var(--color-border)] px-2.5 py-2 text-xs font-semibold"
            }
          >
            {s.at}
          </span>
        ))}
      </div>
      <div className="flex items-baseline justify-between border-t border-[var(--color-border)] pt-2.5 text-xs text-[var(--color-muted-foreground)]">
        {t("home.flowTotal")}
        <b className="text-base font-bold text-[var(--color-headline)]">800 MZN</b>
      </div>
      <span className="rounded-full bg-[var(--color-navy-surface)] py-3 text-center text-[13px] font-bold text-[var(--color-navy-on)]">
        {t("home.flowPay")}
      </span>
      <p className="text-center text-[11px] text-[var(--color-muted-foreground)]">
        {t("home.flowInstant")}
      </p>
    </div>
  );
}

export function DoneScreen() {
  const { t } = useTranslation("landing"); // t:DoneScreen
  return (
    <div className="grid content-start gap-3 p-3.5 text-[12.5px]">
      <div className="grid justify-items-center gap-0.5 pb-0.5 pt-1.5 text-center">
        <span className="mb-1.5 grid h-10 w-10 place-items-center rounded-full bg-[var(--color-navy-surface)]">
          <Check className="h-5 w-5 text-[var(--color-navy-on)]" strokeWidth={3} aria-hidden="true" />
        </span>
        <b className="text-[14.5px] font-bold">{t("home.flowConfirmed")}</b>
        <span className="text-[11.5px] text-[var(--color-muted-foreground)]">
          {t("home.flowPaid", { amount: "800 MZN" })}
        </span>
      </div>
      <div className="grid grid-cols-[56px_minmax(0,1fr)] items-center gap-3 border-t border-[var(--color-border)] pt-2.5">
        <span className="aspect-square overflow-hidden rounded-lg bg-[var(--color-navy-surface)]">
          <BrandTile name="Estúdio Mavalane" />
        </span>
        <span>
          <b className="block text-[12.5px] font-semibold">Corte de cabelo</b>
          <span className="text-[11px] text-[var(--color-muted-foreground)]">
            Sábado, 12 de Set · 14:00
          </span>
        </span>
      </div>
      {/* What a confirmed booking actually gives the customer: the business,
          by name, carrying the seal an administrator checked its documents
          for — and a way to reach it through the platform. Not a street
          address and not a phone number: the address on a booking is the
          customer's own, used when a provider travels to them, and contact
          the other way runs through the message button below, not a reveal
          of a private number. */}
      <div className="flex items-center gap-1.5 border-t border-[var(--color-border)] pt-2.5 text-[12.5px] font-semibold text-[var(--color-foreground)]">
        Estúdio Mavalane
        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--color-headline)]">
          <Check className="h-3 w-3" aria-hidden="true" strokeWidth={3} />
          {t("badgeVerified")}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {[t("home.flowMessage"), t("home.flowBooking")].map((label) => (
          <span
            key={label}
            className="rounded-lg border border-[var(--color-border)] py-2.5 text-center text-[11.5px] font-semibold text-[var(--color-headline)]"
          >
            {label}
          </span>
        ))}
      </div>
      <div className="flex justify-between border-t border-[var(--color-border)] pt-2.5 text-[11.5px] text-[var(--color-muted-foreground)]">
        {t("home.flowReference")}
        <b className="font-semibold tabular-nums text-[var(--color-foreground)]">NTZ-4821</b>
      </div>
      <div className="flex items-center justify-between border-t border-[var(--color-border)] pt-2.5">
        <span className="text-xs font-semibold">{t("home.flowRate")}</span>
        {/* Empty, because this is a question. */}
        <span data-testid="rating-ask" className="flex gap-0.5">
          {Array.from({ length: 5 }, (_, i) => (
            <Star key={i} className="h-3.5 w-3.5 fill-[var(--color-border)] text-[var(--color-border)]" aria-hidden="true" />
          ))}
        </span>
      </div>
    </div>
  );
}
