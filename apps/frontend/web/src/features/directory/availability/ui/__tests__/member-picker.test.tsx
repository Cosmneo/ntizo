import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "@/shared/lib/i18n";
import type { Start } from "@/features/directory/availability/domain/types";
import { MemberPicker } from "../member-picker";

/**
 * A start as `availability.forService` sends one.
 *
 * `minuteOfDay` is derived from the same hour as `startsAt` rather than left
 * at a constant: it is what decides which start is "a próxima", and a fixture
 * whose minutes all matched could not tell an earliest-by-minute rule apart
 * from one that simply takes `starts[0]`.
 */
function start(hourUtc: number, memberIds: string[]): Start {
  return {
    minuteOfDay: hourUtc * 60,
    startsAt: `2026-09-04T${String(hourUtc).padStart(2, "0")}:00:00.000Z`,
    maxMinutes: null,
    // Deliberately not 1: nothing in this component may read a seat count,
    // and a fixture at 1 would let a picker that summed seats instead of
    // counting moments produce the same numbers as one that got it right.
    seatsLeft: 3,
    memberIds,
  };
}

/**
 * Four starts across the day: `m1` is free at three of them, `m2` at none.
 *
 * Three and four so the whole day's total and one person's own count are
 * different numbers — with everybody free at everything, a row that ignored
 * `memberIds` entirely would print the right answer by accident. `m3` holds
 * the fourth start so that "the day has more than this person" is true
 * without `m3` being on the roster the picker is drawing.
 */
const DAY: Start[] = [start(9, ["m1"]), start(11, ["m1"]), start(13, ["m1"]), start(15, ["m3"])];

/**
 * The locale is pinned, not inherited: the suite's default resolves to
 * English (`test/setup.ts` says so), and a test that passed because the
 * default happened to be `pt-MZ` would fail the day the default changed for
 * a reason with nothing to do with this component.
 */
beforeEach(async () => {
  await i18n.changeLanguage("pt-MZ");
});

afterEach(async () => {
  await i18n.changeLanguage("en-US");
});

function renderPicker(over: Partial<React.ComponentProps<typeof MemberPicker>> = {}) {
  const onChange = vi.fn();
  const view = render(
    <MemberPicker
      memberIds={["m1", "m2"]}
      selectedMemberId={undefined}
      onChange={onChange}
      starts={DAY}
      locale="pt-MZ"
      // **Africa/Maputo, deliberately not UTC.** Every `startsAt` above is a
      // UTC instant, so a component that formatted in the device's zone would
      // print 09:00 where the service's own clock says 11:00 — and a fixture
      // on UTC could not tell the two apart.
      timezone="Africa/Maputo"
      {...over}
    />,
  );
  return { onChange, ...view };
}

describe("MemberPicker", () => {
  it("renders nothing at all with one or zero members", () => {
    const { container } = renderPicker({ memberIds: ["m1"] });
    expect(container).toBeEmptyDOMElement();
  });

  it("falls back to a numbered position when no performers were given", () => {
    renderPicker();
    expect(screen.getByRole("radio", { name: /^Profissional 1,/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /^Profissional 2,/ })).toBeInTheDocument();
  });

  it("labels a matching id with the performer's real first name", () => {
    renderPicker({
      performers: [
        { id: "m1", firstName: "Ana", avatarUrl: null },
        { id: "m2", firstName: "Flávio", avatarUrl: null },
      ],
    });
    expect(screen.getByRole("radio", { name: /^Ana,/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /^Flávio,/ })).toBeInTheDocument();
  });

  it("falls back to a numbered position for an id the performer list doesn't cover", () => {
    renderPicker({ performers: [{ id: "m1", firstName: "Ana", avatarUrl: null }] });
    expect(screen.getByRole("radio", { name: /^Ana,/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /^Profissional 2,/ })).toBeInTheDocument();
  });

  it("treats a blank first name as no match, not as a label", () => {
    // `firstName` carries `.default("")` in the schema — a member whose
    // profile has no first name resolves to an empty string, which must not
    // render as a blank row.
    renderPicker({
      performers: [
        { id: "m1", firstName: "", avatarUrl: null },
        { id: "m2", firstName: "Flávio", avatarUrl: null },
      ],
    });
    expect(screen.getByRole("radio", { name: /^Profissional 1,/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /^Flávio,/ })).toBeInTheDocument();
  });

  it("counts one person's own free hours and names their next one, in the service's zone", () => {
    // Three of the day's four starts carry `m1`, and the earliest of those is
    // 09:00 UTC — 11:00 in Maputo, which is the number that has to appear.
    renderPicker({ performers: [{ id: "m1", firstName: "Ana", avatarUrl: null }] });

    expect(
      screen.getByRole("radio", { name: "Ana, 3 livres · a próxima às 11:00" }),
    ).toBeInTheDocument();
  });

  it("gives the anyone row the whole day rather than one person's share", () => {
    // Four starts across three people. A row that reused a member's own count
    // here would say three, and one that read the device's clock would say
    // 09:00.
    renderPicker();

    expect(
      screen.getByRole("radio", {
        name: "Qualquer pessoa disponível, 4 livres · a próxima às 11:00",
      }),
    ).toBeInTheDocument();
  });

  it("names the earliest start of the day, whatever order they arrived in", () => {
    // A `starts[0]` rule reads identically to an earliest-by-the-clock one on
    // any sorted response, so the one fixture that can tell them apart is an
    // unsorted one. 07:00 UTC is 09:00 in Maputo.
    renderPicker({
      starts: [start(13, ["m1"]), start(7, ["m1"])],
      performers: [{ id: "m1", firstName: "Ana", avatarUrl: null }],
    });

    expect(
      screen.getByRole("radio", { name: "Ana, 2 livres · a próxima às 09:00" }),
    ).toBeInTheDocument();
  });

  it("says a person has nothing that day, and still lets them be picked", async () => {
    // `m2` is free at none of the four starts. The row is not dropped and not
    // disabled: a customer may pick them precisely to go looking at another
    // day, and a roster that changed length as the week was browsed would be
    // a moving target. `disabled` would also pull the row out of the tab
    // order, so the very sentence explaining it could never be announced.
    const { onChange } = renderPicker({
      performers: [{ id: "m2", firstName: "Flávio", avatarUrl: null }],
    });

    const row = screen.getByRole("radio", { name: "Flávio, sem horários" });
    expect(row).toBeEnabled();

    await userEvent.click(row);
    expect(onChange).toHaveBeenCalledWith("m2");
  });

  it("ticks the anyone row while nothing is chosen", () => {
    renderPicker();
    expect(screen.getByRole("radio", { checked: true })).toHaveAccessibleName(
      /^Qualquer pessoa disponível/,
    );
  });

  it("ticks exactly the chosen row", () => {
    // One `getByRole` rather than a pair of assertions: it fails if a second
    // row is ticked as well, which a per-row `toBeChecked` would not.
    renderPicker({ selectedMemberId: "m2" });
    expect(screen.getByRole("radio", { checked: true })).toHaveAccessibleName(/^Profissional 2/);
  });

  it("shows the performer's photograph, and their initials when there is none", () => {
    renderPicker({
      performers: [
        { id: "m1", firstName: "Ana", avatarUrl: "https://cdn.test/ana.jpg" },
        { id: "m2", firstName: "Flávio", avatarUrl: null },
      ],
    });

    // The photograph is decorative — the row's own label already names the
    // person — so it is found by its source rather than by an alt text it
    // must not have. Read as the whole list, so a picker that drew a photo on
    // every row fails rather than passing on the one it got right.
    expect([...document.querySelectorAll("img")].map((img) => img.getAttribute("src"))).toEqual([
      "https://cdn.test/ana.jpg",
    ]);
    expect(screen.getByText("FL")).toBeInTheDocument();
  });

  it("reports the anyone row as an absence rather than as an id", async () => {
    // `undefined` is what `availability.forService` itself reads as "anyone";
    // sending a sentinel string would be a member id the roster has not got.
    const { onChange } = renderPicker({ selectedMemberId: "m1" });

    await userEvent.click(screen.getByRole("radio", { name: /^Qualquer pessoa disponível/ }));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });
});
