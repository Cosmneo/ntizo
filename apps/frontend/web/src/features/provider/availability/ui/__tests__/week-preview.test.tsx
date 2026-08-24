import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { WeekPreview } from "../week-preview";
import { FALLBACK_WINDOW } from "../../domain/grid";
import type { PreviewDay } from "../../domain/preview";

/**
 * The week grid after the redesign.
 *
 * Two things changed and both are load-bearing. The grid used to be
 * 06:00–24:00 for everybody — eighteen hour rows, nearly all permanently
 * empty — inside a `min-w-[42rem]` scroller, which is what pushed Friday,
 * Saturday and Sunday off the side of the page. And it carried no numbers at
 * all: the question a provider brings here is "how much work is this", and
 * answering it meant counting rectangles.
 */

const LOCALE = "en-US";

/** Monday 10 Aug 2026 is `weekday` 1; the week runs to Sunday 16th. */
const dayFor = (
  offset: number,
  intervals: [number, number][],
  reason: PreviewDay["reason"] = null,
): PreviewDay => ({
  date: `2026-08-${String(10 + offset).padStart(2, "0")}`,
  weekday: (1 + offset) % 7,
  intervals: intervals.map(([start, end]) => ({ start, end })),
  reason: intervals.length === 0 ? reason : null,
});

const FULL_WEEK: PreviewDay[] = [
  dayFor(0, [[540, 1020]]), // Mon 09:00–17:00
  dayFor(1, [[540, 1020]]), // Tue
  dayFor(2, [[540, 1020]]), // Wed
  dayFor(3, [], "no-rule"),
  dayFor(4, [], "no-rule"),
  dayFor(5, [], "no-rule"),
  dayFor(6, [], "no-rule"),
];

function renderPreview(days: PreviewDay[] = FULL_WEEK) {
  render(<WeekPreview days={days} locale={LOCALE} />);
  // A named <section> is a `region` landmark — the role the page test
  // already relies on.
  return screen.getByRole("region", { name: /week/i });
}

describe("WeekPreview", () => {
  it("draws only the hours in play, with an hour of air on each side", () => {
    renderPreview();

    // 09:00–17:00 worked → the window is 08:00–18:00. Labels sit on the hour
    // lines themselves, closing one included: without the last one the grid
    // runs a full row past its final label with nothing saying where it stops.
    // 08:00 is a gutter label and no block starts there, so it is unique.
    expect(screen.getByText("08:00")).toBeInTheDocument();
    expect(screen.getByText("18:00")).toBeInTheDocument();
    // The old fixed window's extremes are gone, top and bottom. 19:00 is the
    // assertion that matters: it is the first hour *past* the window, so its
    // absence is what says the grid stops where the hours do.
    expect(screen.queryByText("06:00")).not.toBeInTheDocument();
    expect(screen.queryByText("19:00")).not.toBeInTheDocument();
    expect(screen.queryByText("23:00")).not.toBeInTheDocument();
  });

  it("grows the grid only as far as a changed hour needs", () => {
    renderPreview([dayFor(0, [[420, 1020]])]); // 07:00–17:00

    expect(screen.getByText("06:00")).toBeInTheDocument();
    expect(screen.queryByText("05:00")).not.toBeInTheDocument();
  });

  it("falls back to a working-day window when nothing is set", () => {
    renderPreview([dayFor(0, [], "no-rule")]);

    expect(screen.getByText("08:00")).toBeInTheDocument();
    const rows = (FALLBACK_WINDOW.endMinute - FALLBACK_WINDOW.startMinute) / 60;
    expect(rows).toBeLessThan(18);
  });

  it("shows all seven days", () => {
    const grid = renderPreview();

    for (const name of ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]) {
      expect(within(grid).getByText(name)).toBeInTheDocument();
    }
  });

  it("carries each day's date under its name", () => {
    const grid = renderPreview();

    // The week is navigable, so the column headers have to say which week
    // they are — a bare "Mon" is the same on every one of them.
    expect(within(grid).getByText("10")).toBeInTheDocument();
    expect(within(grid).getByText("16")).toBeInTheDocument();
  });

  it("puts each day's own total under its column", () => {
    const grid = renderPreview();

    // Three days of eight hours, four with nothing.
    expect(within(grid).getAllByText("8 hours")).toHaveLength(3);
  });

  it("dims a day's zero rather than hiding it", () => {
    // Every column keeps a number under it so the row reads as one line of
    // totals; the empty ones recede instead of vanishing, which would leave
    // ragged gaps in that line.
    const grid = renderPreview();

    const zeros = within(grid).getAllByText("0");
    expect(zeros).toHaveLength(4);
    expect(zeros[0]).toHaveClass("opacity-55");
  });

  it("still says which kind of empty a blank day is", () => {
    const grid = renderPreview([dayFor(0, [], "house-closure"), dayFor(1, [], "no-rule")]);

    // "No hours set" is the reason wording and appears once; "Closed" is both
    // a reason and a legend entry, which is the same word doing two honest
    // jobs rather than a collision worth renaming around.
    expect(within(grid).getByText("No hours set")).toBeInTheDocument();
    expect(within(grid).getAllByText("Closed").length).toBeGreaterThanOrEqual(2);
  });

  it("names what the colours mean", () => {
    renderPreview();

    expect(screen.getByText("Working")).toBeInTheDocument();
    expect(screen.getByText("Closed", { selector: "span" })).toBeInTheDocument();
  });

  it("draws a tick for every previewed start, only on the days that have them", () => {
    render(
      <WeekPreview
        days={FULL_WEEK}
        locale={LOCALE}
        density="slots"
        slotsByDate={{ "2026-08-10": [540, 645, 750] }}
      />,
    );

    expect(screen.getAllByTestId("slot-mark")).toHaveLength(3);
  });

  /**
   * The barcode this redesign exists to remove. Ninety starts across a working
   * week used to be ninety bars drawn unconditionally, and at that count the
   * hours underneath stopped being readable at all. They are opt-in now, so the
   * default drawing answers "when do I work" and the ladder is one click away
   * for "and where does each booking start".
   */
  it("keeps the slot ladder out of the default drawing", () => {
    render(
      <WeekPreview
        days={FULL_WEEK}
        locale={LOCALE}
        slotsByDate={{ "2026-08-10": [540, 645, 750] }}
      />,
    );

    expect(screen.queryByTestId("slot-mark")).not.toBeInTheDocument();
  });

  it("draws nothing extra when no service is selected", () => {
    renderPreview();

    expect(screen.queryByTestId("slot-mark")).not.toBeInTheDocument();
  });

  it("marks the current time, on today's column only", () => {
    render(
      <WeekPreview
        days={FULL_WEEK}
        locale={LOCALE}
        // Wednesday 12 Aug, 13:30 — inside the 08:00–18:00 window.
        now={{ date: "2026-08-12", minute: 810 }}
      />,
    );

    expect(screen.getAllByTestId("now-line")).toHaveLength(1);
  });

  it("leaves the marker off a week that is not the current one", () => {
    render(
      <WeekPreview days={FULL_WEEK} locale={LOCALE} now={{ date: "2026-09-02", minute: 810 }} />,
    );

    expect(screen.queryByTestId("now-line")).not.toBeInTheDocument();
  });
});
