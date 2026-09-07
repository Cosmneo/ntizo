import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { SectionHead } from "@/features/landing/ui/section-head";
import { BookScreen, DoneScreen, FindScreen } from "@/features/landing/ui/flow-screens";

/**
 * One step: a number, a word, a sentence, and the screen it describes.
 *
 * The three columns are laid out by the parent grid rather than by three
 * self-contained cards, so the phones start on one line however long the
 * sentences run — `display: contents` dissolves this wrapper into that grid.
 * Three columns whose pictures begin at three different heights is the ragged
 * edge that made the block this replaces look unfinished.
 *
 * That mechanism is `lg:`-only. The parent only declares three columns and
 * three rows from `lg` up, so `contents` and the `row-start-*` pins must be
 * gated the same way — applied at every width, they would hand each row-1
 * item its own implicit column below `lg` too (three ~120px slivers instead
 * of a stack, on a grid that never asked for columns). Below `lg` this
 * wrapper stays a plain block and its three children simply stack.
 */
function Step({ n, title, body, children }: {
  n: number;
  title: string;
  body: string;
  children: ReactNode;
}) {
  return (
    <div className="lg:contents">
      <div className="lg:row-start-1 flex items-center gap-2.5">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-[var(--color-navy-surface)] text-[13px] font-bold tabular-nums text-[var(--color-navy-on)]">
          {n}
        </span>
        <h3 className="font-display text-[21px] font-extrabold leading-none tracking-[-0.025em] text-[var(--color-headline)]">
          {title}
        </h3>
      </div>
      <p className="lg:row-start-2 mt-3 max-w-[37ch] self-start text-[15px] leading-relaxed">
        {body}
      </p>
      {/* The bezel is a device, not a card — the one bordered object the page
          allows. Below `lg` it is dropped entirely: a phone drawn inside a
          phone is redundant, and the screen renders on a hairline instead. */}
      <div className="lg:row-start-3 mt-6 w-full border-t border-[var(--color-border)] pt-4 lg:w-[274px] lg:overflow-hidden lg:rounded-[36px] lg:border-[9px] lg:border-[#0d1626] lg:pt-0 lg:shadow-[0_26px_54px_-32px_rgba(0,36,76,0.6)]">
        {children}
      </div>
    </div>
  );
}

/**
 * The flow, on the device customers use.
 *
 * This section used to be three paragraphs in three columns under a heading,
 * which told a visitor nothing they could not have guessed. It now shows the
 * product: the prices in a result list, the free hours and the M-Pesa total,
 * and the verified business and the reference the platform hands over the
 * moment a booking is confirmed.
 */
export function HowItWorks() {
  const { t } = useTranslation("landing"); // t:HowItWorks

  return (
    <section className="page-shell pt-14">
      <SectionHead title={t("home.howTitle")} blurb={t("home.howBlurb")} />
      <div className="grid gap-x-11 gap-y-12 lg:grid-cols-3 lg:grid-rows-[auto_auto_auto] lg:gap-y-0">
        <Step n={1} title={t("home.stepFindTitle")} body={t("home.stepFindBody")}>
          <FindScreen />
        </Step>
        <Step n={2} title={t("home.stepBookTitle")} body={t("home.stepBookBody")}>
          <BookScreen />
        </Step>
        <Step n={3} title={t("home.stepDoneTitle")} body={t("home.stepDoneBody")}>
          <DoneScreen />
        </Step>
      </div>
    </section>
  );
}
