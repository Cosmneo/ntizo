import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ServicePerformerDTO } from "@ntizo/shared/read-models";
import { ServicePerformers } from "../service-performers";

const performer = (over: Partial<ServicePerformerDTO> = {}): ServicePerformerDTO => ({
  id: "m1",
  firstName: "Ana",
  avatarUrl: null,
  ...over,
});

describe("ServicePerformers", () => {
  it("renders nothing for zero or one performer", () => {
    expect(render(<ServicePerformers performers={[]} />).container).toBeEmptyDOMElement();
    expect(
      render(<ServicePerformers performers={[performer()]} />).container,
    ).toBeEmptyDOMElement();
  });

  it("shows each performer's real first name", () => {
    render(
      <ServicePerformers
        performers={[performer({ id: "m1", firstName: "Ana" }), performer({ id: "m2", firstName: "Flávio" })]}
      />,
    );
    expect(screen.getByText("Ana")).toBeInTheDocument();
    expect(screen.getByText("Flávio")).toBeInTheDocument();
  });

  it("falls back to a numbered label instead of a blank caption when firstName is empty", () => {
    // `firstName` carries `.default("")` in its schema, so this is a real
    // value the wire can send, not a loading state. Unguarded, this rendered
    // a `?` monogram above an empty caption — the same case `MemberPicker`
    // already guards for the availability panel's own roster.
    render(
      <ServicePerformers
        performers={[performer({ id: "m1", firstName: "Ana" }), performer({ id: "m2", firstName: "" })]}
      />,
    );
    expect(screen.getByText("Ana")).toBeInTheDocument();
    expect(screen.getByText("Professional 2")).toBeInTheDocument();
    expect(screen.queryByText("?")).not.toBeInTheDocument();
  });

  it("shows the monogram when the photograph does not load", () => {
    // **A dead photo used to leave an empty circle.** The `<img>` was a bare
    // sibling of the fallback, and with both mounted a failed load still lays
    // the element out at its intrinsic (zero) content size holding
    // `min-width: auto` — which pushes the fallback outside the clipped
    // circle, so the initials never appeared. `AvatarImage` unmounts itself
    // on `error`, leaving the fallback as the only child.
    //
    // Asserted on the `<img>` going away rather than on the layout, because
    // jsdom implements no layout at all: the unmount is the mechanism, and a
    // bare `<img>` is exactly what survives this event.
    render(
      <ServicePerformers
        performers={[
          performer({ id: "m1", firstName: "Ana", avatarUrl: "https://cdn.test/ana.jpg" }),
          performer({ id: "m2", firstName: "Flávio" }),
        ]}
      />,
    );

    const photo = document.querySelector("img");
    expect(photo).not.toBeNull();
    fireEvent.error(photo!);

    expect(document.querySelector("img")).toBeNull();
    expect(screen.getByText("AN")).toBeInTheDocument();
  });
});
