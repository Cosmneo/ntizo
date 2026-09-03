import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ProviderBookingStatsDayDTO } from "@ntizo/shared/read-models";
import {
  CHART,
  barPath,
  chartGeometry,
  chartTicks,
  seriesTotals,
  tooltipPlacement,
} from "../domain/activity-chart";

/**
 * Thirty days of two counts, drawn rather than imported: a charting library
 * would be the largest package in this app for one figure.
 *
 * The two colours are validated, not chosen by eye — blue against
 * `#12a05f`, which clears the contrast floor on white and sits inside the
 * dark band on the card's near-black. Their separation for a tritan reader is
 * in the floor band, which is legal only with secondary encoding, so three
 * things here are load-bearing and not decoration: the legend is always
 * drawn, both series carry their total as a direct label, and the two bars of
 * a day are held apart by a gap of surface. The SVG itself is `aria-hidden`;
 * the table below it is the real content for a screen reader, and the relief
 * the contrast check asks for.
 *
 * `preserveAspectRatio="none"` is deliberate: the bars are rectangles whose
 * meaning is their height, and letting them stretch horizontally is what keeps
 * thirty days legible at 390px; the rounded shoulders distort by a hair and
 * nothing else does.
 */
export function ActivityChart({
  days,
  locale,
}: {
  days: readonly ProviderBookingStatsDayDTO[];
  locale: string;
}) {
  const { t } = useTranslation("provider");
  const [hovered, setHovered] = useState<number | null>(null);
  const { bars, groups } = chartGeometry(days);
  const totals = seriesTotals(days);
  const ticks = chartTicks(days, locale);
  const empty = totals.requests === 0 && totals.confirmed === 0;
  const dayLabel = (d: ProviderBookingStatsDayDTO) =>
    t("overview.chartDayLabel", {
      date: new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: "long",
        timeZone: "UTC",
      }).format(new Date(`${d.date}T00:00:00.000Z`)),
      requests: d.requests,
      confirmed: d.confirmed,
    });

  return (
    <section
      className="rounded-[var(--radius-card)] border border-[var(--color-border)] p-5"
      style={{ ["--chart-confirmed" as string]: "#12a05f" }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <h2 className="type-caption font-bold tracking-[0.14em] text-[var(--color-muted-foreground)] uppercase">
            {t("overview.chartTitle")}
          </h2>
          <p className="type-caption text-[var(--color-muted-foreground)]">
            {t("overview.chartRange")}
          </p>
        </div>
        <ul className="flex list-none gap-4 p-0">
          {(
            [
              ["requests", "var(--color-primary)", totals.requests, t("overview.chartRequests")],
              [
                "confirmed",
                "var(--chart-confirmed)",
                totals.confirmed,
                t("overview.chartConfirmed"),
              ],
            ] as const
          ).map(([key, colour, total, label]) => (
            <li key={key} className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: colour }}
              />
              <span className="type-caption text-[var(--color-muted-foreground)]">{label}</span>
              <span className="type-body-medium font-semibold tabular-nums">{total}</span>
            </li>
          ))}
        </ul>
      </div>

      {empty ? (
        <p className="type-body mt-6 mb-2 text-[var(--color-muted-foreground)]">
          {t("overview.chartEmpty")}
        </p>
      ) : (
        <div className="relative mt-4">
          <svg
            aria-hidden="true"
            viewBox={`0 0 ${CHART.width} ${CHART.height}`}
            preserveAspectRatio="none"
            className="h-[176px] w-full"
            onMouseLeave={() => setHovered(null)}
          >
            {bars.map((bar) => (
              <path
                key={bar.key}
                d={barPath(bar.x, bar.y, bar.width, bar.height, CHART.radius)}
                fill={bar.series === "requests" ? "var(--color-primary)" : "var(--chart-confirmed)"}
              />
            ))}
            {groups.map((group, i) => (
              <rect
                key={group.day.date}
                x={group.x}
                y={0}
                width={group.width}
                height={CHART.height}
                fill="transparent"
                onMouseEnter={() => setHovered(i)}
              />
            ))}
            {hovered !== null && (
              <rect
                x={groups[hovered]!.x}
                y={0}
                width={groups[hovered]!.width}
                height={CHART.height}
                fill="color-mix(in srgb, var(--color-foreground) 6%, transparent)"
              />
            )}
          </svg>

          {hovered !== null && (
            <p
              // `max-w-full` and the placement together are what keep the
              // label on the card: the shift is only guaranteed to contain a
              // tooltip no wider than the plot it sits over.
              //
              // `whitespace-nowrap` because an absolutely positioned box is
              // shrink-to-fit: near the last days `left` sits close to 100%,
              // the width left of the edge collapses, and the label folded
              // onto four lines. The containment arithmetic is untouched — it
              // only ever required the label be no wider than the plot.
              className="type-caption pointer-events-none absolute -top-1 max-w-full whitespace-nowrap rounded-[var(--radius-field)] bg-[var(--color-foreground)] px-2 py-1 text-[var(--color-background)]"
              style={tooltipPlacement(groups[hovered]!.x, groups[hovered]!.width)}
            >
              {dayLabel(groups[hovered]!.day)}
            </p>
          )}

          <div className="mt-2 flex justify-between">
            {ticks.map((tick) => (
              <span key={tick.index} className="type-caption text-[var(--color-muted-foreground)]">
                {tick.label}
              </span>
            ))}
          </div>
        </div>
      )}

      <table className="sr-only">
        <caption>{`${t("overview.chartTitle")} — ${t("overview.chartRange")}`}</caption>
        <thead>
          <tr>
            <th scope="col">{t("overview.chartTableDay")}</th>
            <th scope="col">{t("overview.chartRequests")}</th>
            <th scope="col">{t("overview.chartConfirmed")}</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d.date}>
              <th scope="row">{d.date}</th>
              <td>{d.requests}</td>
              <td>{d.confirmed}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
