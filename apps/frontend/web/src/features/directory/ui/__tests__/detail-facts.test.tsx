import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DetailFacts } from "../detail-facts";

describe("DetailFacts", () => {
  it("renders each label with its value", () => {
    render(<DetailFacts facts={[{ label: "Categoria", value: "Electricidade" }]} />);
    expect(screen.getByText("Categoria")).toBeInTheDocument();
    expect(screen.getByText("Electricidade")).toBeInTheDocument();
  });

  it("drops a fact with no value rather than printing an empty cell", () => {
    // A labelled blank reads as data that failed to load. A provider who never
    // published hours or has no services must not get an empty column.
    render(
      <DetailFacts
        facts={[
          { label: "Categoria", value: "Electricidade" },
          { label: "Na Ntizo desde", value: "" },
        ]}
      />,
    );
    expect(screen.queryByText("Na Ntizo desde")).not.toBeInTheDocument();
  });

  it("keeps a fact whose value is the literal zero, not a falsy value", () => {
    // "0" is a real fact a provider with no published services must still
    // read as "Services 0" — trim() !== "" is a presence check, and a plain
    // `if (!value)` falsy check would wrongly delete this row. This test
    // exists to catch a regression to that falsy check, which the earlier
    // "drops a fact with no value" test (using only "") cannot: both
    // predicates behave identically on an empty string.
    render(<DetailFacts facts={[{ label: "Services", value: "0" }]} />);
    expect(screen.getByText("Services")).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("renders nothing when no fact survives", () => {
    const { container } = render(<DetailFacts facts={[{ label: "Categoria", value: "" }]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("pairs each value with its own label for a screen reader", () => {
    render(
      <DetailFacts
        facts={[
          { label: "Categoria", value: "Electricidade" },
          { label: "Duração", value: "60 min" },
        ]}
      />,
    );
    const terms = screen.getAllByRole("term");
    expect(terms).toHaveLength(2);
  });
});
