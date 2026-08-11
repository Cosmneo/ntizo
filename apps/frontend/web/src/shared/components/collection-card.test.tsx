import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { CollectionCard } from "./collection-card";

/**
 * One description, two renderings.
 *
 * The viewport decides which is *shown* — the table above `md`, the cards
 * below — and CSS is what does the deciding, so these assert that both exist
 * and carry the same facts. A row rendered only into the table would vanish on
 * a phone; a row rendered only into the cards would vanish on a laptop; and
 * either failure is invisible from the other screen size.
 */
const columns = [
  { key: "person", label: "Person" },
  { key: "role", label: "Role" },
  { key: "date", label: "Date" },
  { key: "actions", label: "Actions" },
];

function renderCard(overrides: Partial<Parameters<typeof CollectionCard>[0]> = {}) {
  return render(
    <CollectionCard
      title="People"
      shown={1}
      total={1}
      loading={false}
      search=""
      onSearchChange={() => undefined}
      searchPlaceholder="Search"
      columns={columns}
      rows={[
        {
          key: "r1",
          primary: <span>Salif Faustino</span>,
          cells: { role: "Admin", date: "24 Jun 2026" },
          actions: <button type="button">Menu</button>,
        },
      ]}
      emptyText="Nobody here yet."
      noMatchesText="Nothing matches."
      filtered={false}
      skeletonRows={null}
      {...overrides}
    />,
  );
}

describe("CollectionCard", () => {
  it("renders the row as a table and as a card", () => {
    renderCard();
    // Twice: once in each rendering. A single occurrence would mean one of the
    // two screen sizes shows nothing.
    expect(screen.getAllByText("Salif Faustino")).toHaveLength(2);
    expect(screen.getAllByText("Admin")).toHaveLength(2);
  });

  it("labels each value on the card, where there are no column headers", () => {
    renderCard();
    const card = screen.getByRole("list").querySelector("li")!;
    // The phone has one column, so a header row at the top would leave every
    // value orphaned from what it means.
    expect(within(card).getByText("Role")).toBeTruthy();
    expect(within(card).getByText("Date")).toBeTruthy();
  });

  it("keeps the actions menu out of the card's labelled pairs", () => {
    // It is a control, not a fact about the row, and "Actions: [menu]" reads
    // as a value.
    const card = renderCard().container.querySelector("li")!;
    expect(within(card).queryByText("Actions")).toBeNull();
    expect(within(card).getByRole("button", { name: "Menu" })).toBeTruthy();
  });

  it("omits a column marked hideOnCard", () => {
    renderCard({
      columns: [...columns.slice(0, 2), { key: "date", label: "Date", hideOnCard: true }],
    });
    const card = screen.getByRole("list").querySelector("li")!;
    expect(within(card).queryByText("Date")).toBeNull();
    // Still in the table, where there is room for it.
    expect(screen.getByText("24 Jun 2026")).toBeTruthy();
  });

  it("says nothing matches when filters are on, and empty when they are not", () => {
    const empty = renderCard({ rows: [], shown: 0, total: 0, filtered: false });
    expect(screen.getAllByText("Nobody here yet.").length).toBeGreaterThan(0);
    empty.unmount();

    // A server-filtered list cannot know its unfiltered size, so this must come
    // from the flag rather than from `total === 0`.
    renderCard({ rows: [], shown: 0, total: 0, filtered: true });
    expect(screen.getAllByText("Nothing matches.").length).toBeGreaterThan(0);
  });

  it("renders an em dash for a cell the row did not supply", () => {
    renderCard({
      rows: [{ key: "r1", primary: <span>X</span>, cells: { role: "Admin" } }],
    });
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("offers no filter button when there is nothing to filter by", () => {
    renderCard();
    expect(screen.queryByRole("button", { name: /filter/i })).toBeNull();
  });
});
