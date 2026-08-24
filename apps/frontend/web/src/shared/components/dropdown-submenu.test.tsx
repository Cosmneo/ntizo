import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@ntizo/frontend-ui";

/**
 * Picking something from a submenu.
 *
 * This lived in `@ntizo/frontend-ui` and is tested from the app because the
 * app is where the failure showed: the workspace switcher and "create new
 * provider" both did nothing when clicked, silently.
 *
 * The cause was that a submenu portals into `document.body` as a *sibling* of
 * the menu that owns it, so the parent's close-on-outside-click check —
 * `content.contains(target)` — called every submenu click "outside". `mousedown`
 * closed the whole menu, the item unmounted, and the `click` that would have
 * run `onSelect` never happened.
 *
 * The submenu is opened by hovering, which is what a mouse does — and what
 * `userEvent` reproduces. Clicking the row would open it on the pointer moving
 * in and toggle it shut again on the click that follows.
 *
 * It is tested with `userEvent`, not `fireEvent.click`, and that distinction is
 * the entire point. A synthetic `.click()` dispatches no `mousedown`, so it
 * sailed past the bug — which is exactly why the manual check I ran first said
 * the switcher worked while the user was looking at one that did not.
 */
function Menu({ onPick }: { onPick: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <button type="button">Open</button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Workspaces</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem onSelect={onPick}>Second workspace</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem onSelect={() => undefined}>Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

describe("dropdown submenu", () => {
  it("runs onSelect for an item inside a submenu", async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<Menu onPick={onPick} />);

    await user.click(screen.getByRole("button", { name: "Open" }));
    await user.hover(screen.getByText("Workspaces"));
    await user.click(screen.getByText("Second workspace"));

    expect(onPick).toHaveBeenCalledTimes(1);
  });

  it("closes the whole menu after the submenu selection", async () => {
    // Selecting is finishing. Leaving the menu open over the page it just
    // navigated is how the old dialog-based version behaved and it read as
    // "nothing happened".
    const user = userEvent.setup();
    render(<Menu onPick={() => undefined} />);

    await user.click(screen.getByRole("button", { name: "Open" }));
    await user.hover(screen.getByText("Workspaces"));
    await user.click(screen.getByText("Second workspace"));

    expect(screen.queryByText("Sign out")).toBeNull();
  });

  it("still closes on a click that is genuinely outside", async () => {
    // The guard must not have been widened into "never close".
    const user = userEvent.setup();
    render(
      <div>
        <Menu onPick={() => undefined} />
        <button type="button">Elsewhere</button>
      </div>,
    );

    await user.click(screen.getByRole("button", { name: "Open" }));
    expect(screen.getByText("Sign out")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Elsewhere" }));
    expect(screen.queryByText("Sign out")).toBeNull();
  });

  it("keeps the parent open while the submenu is being used", async () => {
    const user = userEvent.setup();
    render(<Menu onPick={() => undefined} />);

    await user.click(screen.getByRole("button", { name: "Open" }));
    await user.hover(screen.getByText("Workspaces"));

    // Both levels on screen at once: opening the submenu must not be read as
    // clicking away from the menu that contains it.
    expect(screen.getByText("Sign out")).toBeTruthy();
    expect(screen.getByText("Second workspace")).toBeTruthy();
  });
});
