import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemberPicker } from "../member-picker";

describe("MemberPicker", () => {
  it("renders nothing at all with one or zero members", () => {
    const { container } = render(
      <MemberPicker memberIds={["m1"]} selectedMemberId={undefined} onChange={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("falls back to a numbered position when no performers were given", () => {
    render(
      <MemberPicker memberIds={["m1", "m2"]} selectedMemberId={undefined} onChange={vi.fn()} />,
    );
    expect(screen.getByRole("radio", { name: "Professional 1" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Professional 2" })).toBeInTheDocument();
  });

  it("labels a matching id with the performer's real first name", () => {
    render(
      <MemberPicker
        memberIds={["m1", "m2"]}
        selectedMemberId={undefined}
        onChange={vi.fn()}
        performers={[
          { id: "m1", firstName: "Ana" },
          { id: "m2", firstName: "Flávio" },
        ]}
      />,
    );
    expect(screen.getByRole("radio", { name: "Ana" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Flávio" })).toBeInTheDocument();
  });

  it("falls back to a numbered position for an id the performer list doesn't cover", () => {
    render(
      <MemberPicker
        memberIds={["m1", "m2"]}
        selectedMemberId={undefined}
        onChange={vi.fn()}
        performers={[{ id: "m1", firstName: "Ana" }]}
      />,
    );
    expect(screen.getByRole("radio", { name: "Ana" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Professional 2" })).toBeInTheDocument();
  });

  it("treats a blank first name as no match, not as a label", () => {
    // `firstName` carries `.default("")` in the schema — a member whose
    // profile has no first name resolves to an empty string, which must not
    // render as a blank button.
    render(
      <MemberPicker
        memberIds={["m1", "m2"]}
        selectedMemberId={undefined}
        onChange={vi.fn()}
        performers={[
          { id: "m1", firstName: "" },
          { id: "m2", firstName: "Flávio" },
        ]}
      />,
    );
    expect(screen.getByRole("radio", { name: "Professional 1" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Flávio" })).toBeInTheDocument();
  });
});
