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

/**
 * `Partial` over the component's own props loses the search union's
 * guarantee — a discriminated union flattened by `Partial` no longer keeps
 * `hideSearch` correlated with the three fields it gates, and every override
 * in this file only ever touches the non-search half anyway. Search stays a
 * plain optional trio here rather than pulled from the component's type.
 */
function renderCard(
  overrides: Partial<
    Omit<
      Parameters<typeof CollectionCard>[0],
      "hideSearch" | "search" | "onSearchChange" | "searchPlaceholder"
    >
  > & {
    search?: string;
    onSearchChange?: (value: string) => void;
    searchPlaceholder?: string;
  } = {},
) {
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
      columns: [
        ...columns.slice(0, 2),
        { key: "date", label: "Date", hideOnCard: true },
      ],
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

  it("uses emptyText as the title when no title is given", () => {
    // Every caller passed one sentence before the card grew a headline, and a
    // caller that still does must keep saying that sentence rather than nothing.
    renderCard({ rows: [], shown: 0, total: 0, filtered: false });
    for (const node of screen.getAllByText("Nobody here yet.")) {
      expect(node.tagName).toBe("H2");
    }
  });

  it("puts emptyText under the title once there is one", () => {
    renderCard({
      rows: [],
      shown: 0,
      total: 0,
      filtered: false,
      emptyTitle: "Nobody here yet",
    });
    expect(screen.getAllByText("Nobody here yet")[0]!.tagName).toBe("H2");
    expect(screen.getAllByText("Nobody here yet.")[0]!.tagName).toBe("P");
  });

  it("keeps the brand mark off a list that a filter emptied", () => {
    // Nothing is missing — the filter is hiding it — so the mark would be
    // claiming the list is empty when it is not.
    const { container } = renderCard({
      rows: [],
      shown: 0,
      total: 0,
      filtered: true,
    });
    expect(container.querySelector("linearGradient")).toBeNull();
  });

  it("draws the brand mark on a list that is genuinely empty", () => {
    const { container } = renderCard({
      rows: [],
      shown: 0,
      total: 0,
      filtered: false,
    });
    expect(container.querySelector("linearGradient")).toBeTruthy();
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

describe("CollectionCard while loading", () => {
  /**
   * The loading state is generated from the same columns as the loaded one, so
   * these assert the two agree in shape. A skeleton with fewer cells than the
   * table has headers is the failure this replaces: nothing errors, the page
   * just jumps when the data lands.
   */
  function renderLoading(overrides = {}) {
    return renderCard({
      loading: true,
      rows: [],
      shown: 0,
      total: 0,
      ...overrides,
    });
  }

  it("draws a placeholder row per requested placeholder, with a cell per column", () => {
    const { container } = renderLoading({ skeletonPlaceholders: 3 });
    const bodyRows = container.querySelectorAll("tbody tr");
    expect(bodyRows).toHaveLength(3);
    for (const row of bodyRows) {
      expect(row.querySelectorAll("td")).toHaveLength(columns.length);
    }
  });

  it("draws the same number of cards as table rows", () => {
    const { container } = renderLoading({ skeletonPlaceholders: 4 });
    // The card list is a plain div while loading — there are no rows to list.
    const cards = container.querySelectorAll("dl");
    expect(cards).toHaveLength(4);
    expect(container.querySelectorAll("tbody tr")).toHaveLength(4);
  });

  it("gives each card one labelled pair per column shown on a card", () => {
    // person is the primary block and actions is a control, so neither is a
    // pair: four columns leave two.
    const { container } = renderLoading({ skeletonPlaceholders: 1 });
    expect(container.querySelectorAll("dl > div")).toHaveLength(2);
  });

  it("follows hideOnCard, so the placeholder is not taller than the card it stands in for", () => {
    const { container } = renderLoading({
      skeletonPlaceholders: 1,
      columns: [
        ...columns.slice(0, 2),
        { key: "date", label: "Date", hideOnCard: true },
      ],
    });
    expect(container.querySelectorAll("dl > div")).toHaveLength(1);
  });

  it("shows neither empty message while loading", () => {
    renderLoading();
    expect(screen.queryByText("Nobody here yet.")).toBeNull();
    expect(screen.queryByText("Nothing matches.")).toBeNull();
  });

  it("keeps the search box live, so typing is not interrupted when the query refetches", () => {
    // A new search term is a new query key with no cached data, which reads as
    // loading. Replacing the input with a placeholder would unmount it after
    // the first character and take the focus with it.
    renderLoading({ search: "sal" });
    expect(screen.getByPlaceholderText("Search")).toBeTruthy();
  });
});
