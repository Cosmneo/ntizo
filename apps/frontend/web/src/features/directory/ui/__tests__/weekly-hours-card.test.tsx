import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { WeeklyHoursDTO } from "@ntizo/shared/read-models";
import { WeeklyHoursCard } from "../weekly-hours-card";

const closed = (weekday: number): WeeklyHoursDTO => ({ weekday, intervals: [] });
const open = (weekday: number, startMinute: number, endMinute: number): WeeklyHoursDTO => ({
  weekday, intervals: [{ startMinute, endMinute }],
});

const TYPICAL: WeeklyHoursDTO[] = [
  closed(0), open(1, 480, 1080), open(2, 480, 1080), open(3, 480, 1080),
  open(4, 480, 1080), open(5, 480, 1080), open(6, 540, 840),
];

describe("WeeklyHoursCard", () => {
  it("renders nothing when the provider never published hours", () => {
    // Seven closed days is what an unconfigured provider looks like, and a
    // card listing "Fechado" seven times says the business is never open —
    // which is a claim, and the wrong one.
    const { container } = render(<WeeklyHoursCard hours={[0,1,2,3,4,5,6].map(closed)} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for an empty list", () => {
    const { container } = render(<WeeklyHoursCard hours={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("prints a collapsed run once, with its hours", () => {
    render(<WeeklyHoursCard hours={TYPICAL} />);
    expect(screen.getByText("08:00 – 18:00")).toBeInTheDocument();
    expect(screen.getByText("09:00 – 14:00")).toBeInTheDocument();
  });

  it("says a closed day is closed", () => {
    render(<WeeklyHoursCard hours={TYPICAL} />);
    expect(screen.getByText("Closed")).toBeInTheDocument();
  });

  it("prints both spans of a split day", () => {
    render(
      <WeeklyHoursCard
        hours={[
          closed(0),
          { weekday: 1, intervals: [{ startMinute: 480, endMinute: 720 }, { startMinute: 840, endMinute: 1080 }] },
          closed(2), closed(3), closed(4), closed(5), closed(6),
        ]}
      />,
    );
    expect(screen.getByText("08:00 – 12:00, 14:00 – 18:00")).toBeInTheDocument();
  });
});
