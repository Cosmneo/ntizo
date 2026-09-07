import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { OPTION_SEARCH_THRESHOLD, SearchableOptions } from "../searchable-options";

/**
 * `n` options named after the trades this site actually lists, so a match is
 * matching something a reader would type rather than "Option 7".
 */
const NAMES = [
  "Canalização",
  "Electricidade",
  "Limpeza de casa",
  "Mecânico",
  "Cozinheiro",
  "Pedreiro",
  "Aulas de Música",
  "Jardinagem e Piscinas",
  "Beleza e cabelo",
  "Carpintaria",
  "Pintura",
  "Costura",
];

function optionsFor(count: number) {
  return NAMES.slice(0, count).map((name) => ({
    key: name,
    label: name,
    node: <a href={`/services?category=${name}`}>{name}</a>,
  }));
}

function renderOptions(count: number, lead?: React.ReactNode) {
  return render(
    <SearchableOptions
      options={optionsFor(count)}
      searchLabel="Search categories"
      searchPlaceholder="Search categories"
      noMatchLabel={(term) => `No category matches “${term}”`}
      lead={lead}
    />,
  );
}

const field = () => screen.queryByRole("searchbox", { name: "Search categories" });

describe("SearchableOptions", () => {
  /**
   * The threshold is the whole point of the component: below it a field is a
   * control that filters a list already visible in full, and it costs a row of
   * a panel that is only ten rows tall.
   */
  it("offers no search field until there are more options than a reader can scan", async () => {
    renderOptions(OPTION_SEARCH_THRESHOLD);
    expect(field()).toBeNull();
    expect(screen.getAllByRole("link")).toHaveLength(OPTION_SEARCH_THRESHOLD);
  });

  it("grows one as soon as there is one option too many", async () => {
    renderOptions(OPTION_SEARCH_THRESHOLD + 1);
    expect(field()).toBeInTheDocument();
  });

  /**
   * The reason `normalizeForSearch` exists. A Portuguese keyboard makes the
   * cedilla work; a hurry does not, and "canalizacao" is what gets typed.
   */
  it("matches a name whose accents the reader did not type", async () => {
    renderOptions(NAMES.length);
    fireEvent.change(field()!, { target: { value: "canalizacao" } });

    expect(screen.getByRole("link", { name: "Canalização" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Electricidade" })).toBeNull();
  });

  it("ignores case and matches inside a name, not only at its start", async () => {
    renderOptions(NAMES.length);
    fireEvent.change(field()!, { target: { value: "MUSICA" } });

    expect(screen.getByRole("link", { name: "Aulas de Música" })).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  /**
   * A term that matches nothing has to say so. An empty panel under a field
   * with a word in it reads as a control that broke, not as an answer.
   */
  it("says so when a term matches none of them, quoting what was typed", async () => {
    renderOptions(NAMES.length);
    fireEvent.change(field()!, { target: { value: "dentista" } });

    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.getByText("No category matches “dentista”")).toBeInTheDocument();
  });

  /**
   * "All" clears the group rather than choosing within it, so it answers a
   * different question from the one being typed — and a row that ignored the
   * term would be the only row on screen that did.
   */
  it("hides the 'All' row while a term is typed, and brings it back when cleared", async () => {
    renderOptions(NAMES.length, <a href="/services">All categories</a>);
    expect(screen.getByRole("link", { name: "All categories" })).toBeInTheDocument();

    fireEvent.change(field()!, { target: { value: "pintura" } });
    expect(screen.queryByRole("link", { name: "All categories" })).toBeNull();

    fireEvent.change(field()!, { target: { value: "" } });
    expect(screen.getByRole("link", { name: "All categories" })).toBeInTheDocument();
  });

  /**
   * Without JavaScript the field does nothing and the options are all that
   * renders — the floor `FilterPill` was built to hold, since these are links
   * a crawler follows. Nothing may be withheld until something is typed.
   */
  it("renders every option before a term is typed", async () => {
    renderOptions(NAMES.length, <a href="/services">All categories</a>);
    expect(screen.getAllByRole("link")).toHaveLength(NAMES.length + 1);
  });
});
