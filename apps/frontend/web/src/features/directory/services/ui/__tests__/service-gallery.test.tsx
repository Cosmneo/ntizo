import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ServiceGallery } from "../service-gallery";

describe("ServiceGallery", () => {
  it("renders nothing with no images", () => {
    const { container } = render(<ServiceGallery images={[]} alt="x" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("promotes a clicked thumbnail to the main image", async () => {
    render(
      <ServiceGallery images={["https://cdn.ntizo.test/a.jpg", "https://cdn.ntizo.test/b.jpg"]} alt="Service" />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Service 2" }));
    expect(screen.getByRole("img", { name: "Service" })).toHaveAttribute(
      "src",
      "https://cdn.ntizo.test/b.jpg",
    );
  });

  it("does not carry a selected index over when the caller keys it by a changing id", async () => {
    // `service-detail-page.tsx` keys this component by `service.id` for
    // exactly this reason: without the key, `active` is component-local
    // state that would survive a navigation to a different service — the
    // page reuses its own component instance across services, it does not
    // remount for each one. Rendering with a different `key` here is what
    // that fix actually does at the React level: it forces the unmount this
    // test asserts on, rather than merely swapping props on the same
    // instance.
    const { rerender } = render(
      <ServiceGallery
        key="svc-a"
        images={["https://cdn.ntizo.test/a1.jpg", "https://cdn.ntizo.test/a2.jpg"]}
        alt="A"
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "A 2" }));
    expect(screen.getByRole("img", { name: "A" })).toHaveAttribute(
      "src",
      "https://cdn.ntizo.test/a2.jpg",
    );

    rerender(
      <ServiceGallery
        key="svc-b"
        images={["https://cdn.ntizo.test/b1.jpg", "https://cdn.ntizo.test/b2.jpg"]}
        alt="B"
      />,
    );
    expect(screen.getByRole("img", { name: "B" })).toHaveAttribute(
      "src",
      "https://cdn.ntizo.test/b1.jpg",
    );
  });
});
