import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Pager } from "../pager";

const renderPage = (slot: { page: number; offset: number; current: boolean }) => (
  <a
    key={slot.page}
    href={`/services?offset=${String(slot.offset)}`}
    aria-current={slot.current ? "page" : undefined}
  >
    {slot.page}
  </a>
);

describe("Pager", () => {
  it("renders nothing at all when everything fits on one page", () => {
    // Drawing "1" alone makes an eight-result search look truncated.
    const { container } = render(
      <Pager total={8} pageSize={24} offset={0} label="Pages" renderPage={renderPage} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("names itself, so it is not a third unlabelled nav on the page", () => {
    render(<Pager total={96} pageSize={24} offset={0} label="Pages" renderPage={renderPage} />);
    expect(screen.getByRole("navigation", { name: "Pages" })).toBeInTheDocument();
  });

  it("marks the current page for assistive technology, not only in colour", () => {
    render(<Pager total={96} pageSize={24} offset={48} label="Pages" renderPage={renderPage} />);
    expect(screen.getByRole("link", { current: "page" })).toHaveTextContent("3");
  });

  it("draws an ellipsis that is not a link", () => {
    // A "…" a keyboard user can focus is a stop that goes nowhere.
    render(<Pager total={480} pageSize={24} offset={216} label="Pages" renderPage={renderPage} />);
    const gaps = screen.getAllByText("…");
    expect(gaps).toHaveLength(2);
    for (const gap of gaps) expect(gap.tagName).not.toBe("A");
  });

  it("shows only the edges the reader can actually reach", () => {
    // "Previous" on page one is a control whose only outcome is the page you
    // are on. Each page passes its own edges, and passes nothing at the ends.
    render(
      <Pager
        total={96}
        pageSize={24}
        offset={0}
        label="Pages"
        renderPage={renderPage}
        next={<a href="/services?offset=24">Next</a>}
      />,
    );
    expect(screen.queryByText("Previous")).not.toBeInTheDocument();
    expect(screen.getByText("Next")).toBeInTheDocument();
  });
});
