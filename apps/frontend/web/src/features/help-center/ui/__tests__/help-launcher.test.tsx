import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { HelpLauncher } from "../help-launcher";

/**
 * Both this button and the browse pages' filter capsule are `fixed`, and
 * neither can measure the other. jsdom does no layout, so the collision is not
 * assertable here — the offsets that cause it are, and they are the whole fix.
 *
 * What a phone showed: the capsule is centred and sized to its content, so at
 * 390px "Filtros · Ordenar: Sugeridos" ran to roughly x=50..340 while this
 * button sat at x=326..374, both in the same 72–128px band above the bottom
 * nav. They were drawn on top of one another.
 */
const launcher = () => screen.getByRole("button", { name: /help/i });

describe("HelpLauncher", () => {
  it("rests just above the bottom nav on a page with no capsule", async () => {
    render(<HelpLauncher unreadCount={0} onOpen={vi.fn()} />);

    // 5rem clears `MobileNav`'s 56px; `md:` drops the nav and the offset with it.
    expect(launcher().className).toContain("bottom-20");
    expect(launcher().className).toContain("md:bottom-6");
  });

  it("steps above the capsule on the pages that draw one", async () => {
    render(<HelpLauncher unreadCount={0} onOpen={vi.fn()} raised />);

    // The capsule's own bottom — nav + inset + 1rem — plus its height and a gap.
    expect(launcher().className).toContain(
      "bottom-[calc(3.5rem+env(safe-area-inset-bottom)+5rem)]",
    );
    expect(launcher().className).toContain("md:bottom-[7rem]");
    // And it must not carry the resting offsets as well, or the later class in
    // the stylesheet decides which one wins rather than this prop.
    expect(launcher().className).not.toContain("bottom-20");
    expect(launcher().className).not.toContain("md:bottom-6");
  });

  it("keeps its corner and its stacking order either way", async () => {
    const { rerender } = render(<HelpLauncher unreadCount={0} onOpen={vi.fn()} />);
    expect(launcher().className).toContain("right-4");
    // Under the open panel's own backdrop, which is `z-50`.
    expect(launcher().className).toContain("z-30");

    rerender(<HelpLauncher unreadCount={0} onOpen={vi.fn()} raised />);
    expect(launcher().className).toContain("right-4");
    expect(launcher().className).toContain("z-30");
  });
});
