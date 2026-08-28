import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "../dropdown-menu";

/**
 * Working a menu without a mouse.
 *
 * The menu opened from the keyboard and then went nowhere: no row was in the
 * tab order and no key was listened for, so a reader could put a menu on
 * screen and had no way to choose anything in it. Eight surfaces use this
 * component, which is why the fix and these tests are on the component rather
 * than on the sort control that happened to surface it.
 *
 * Driven with `userEvent` rather than `fireEvent`, for the same reason the
 * submenu tests are: `fireEvent.keyDown` dispatches a keydown and nothing
 * else, so it cannot tell a key that was handled from one that fell through
 * to the browser's own behaviour — which is precisely what Enter on a trigger
 * and Tab out of a panel turn on.
 */
function Menu({
  onPick = () => undefined,
  onRefused = () => undefined,
}: {
  onPick?: (label: string) => void;
  onRefused?: () => void;
}) {
  return (
    <div>
      <button type="button">Before</button>
      <DropdownMenu>
        <DropdownMenuTrigger>
          <button type="button">Open</button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>Signed in</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => onPick("Edit")}>Edit</DropdownMenuItem>
          <DropdownMenuItem disabled onSelect={onRefused}>
            Move up
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onPick("Hide")}>Hide</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <button type="button">After</button>
    </div>
  );
}

describe("dropdown menu keyboard", () => {
  it("puts focus on the first row when Enter opens it", async () => {
    const user = userEvent.setup();
    render(<Menu />);

    await user.tab();
    await user.tab();
    expect(screen.getByRole("button", { name: "Open" })).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(screen.getByRole("menuitem", { name: "Edit" })).toHaveFocus();
  });

  it("puts focus on the first row when Space opens it", async () => {
    const user = userEvent.setup();
    render(<Menu />);

    screen.getByRole("button", { name: "Open" }).focus();
    await user.keyboard(" ");

    expect(screen.getByRole("menuitem", { name: "Edit" })).toHaveFocus();
  });

  it("puts focus on the first row when ArrowDown opens it", async () => {
    const user = userEvent.setup();
    render(<Menu />);

    const trigger = screen.getByRole("button", { name: "Open" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    trigger.focus();
    await user.keyboard("{ArrowDown}");

    expect(screen.getByRole("menuitem", { name: "Edit" })).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  it("opens on the last row when the trigger is reached upwards", async () => {
    // Someone pressing Up is reaching for the bottom of the menu. Opening on
    // the first row would make them walk the whole list to get there.
    const user = userEvent.setup();
    render(<Menu />);

    screen.getByRole("button", { name: "Open" }).focus();
    await user.keyboard("{ArrowUp}");

    expect(screen.getByRole("menuitem", { name: "Hide" })).toHaveFocus();
  });

  it("moves down the rows and wraps round at the bottom", async () => {
    const user = userEvent.setup();
    render(<Menu />);
    screen.getByRole("button", { name: "Open" }).focus();
    await user.keyboard("{ArrowDown}");

    // Edit → Hide: "Move up" is disabled and is stepped over, not landed on.
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Hide" })).toHaveFocus();

    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Edit" })).toHaveFocus();
  });

  it("moves up the rows and wraps round at the top", async () => {
    const user = userEvent.setup();
    render(<Menu />);
    screen.getByRole("button", { name: "Open" }).focus();
    await user.keyboard("{ArrowDown}");

    await user.keyboard("{ArrowUp}");
    expect(screen.getByRole("menuitem", { name: "Hide" })).toHaveFocus();

    await user.keyboard("{ArrowUp}");
    expect(screen.getByRole("menuitem", { name: "Edit" })).toHaveFocus();
  });

  it("jumps to the ends with Home and End", async () => {
    const user = userEvent.setup();
    render(<Menu />);
    screen.getByRole("button", { name: "Open" }).focus();
    await user.keyboard("{ArrowDown}");

    await user.keyboard("{End}");
    expect(screen.getByRole("menuitem", { name: "Hide" })).toHaveFocus();

    await user.keyboard("{Home}");
    expect(screen.getByRole("menuitem", { name: "Edit" })).toHaveFocus();
  });

  it("skips a refused row with End as well as with the arrows", async () => {
    // End on a menu whose last row is disabled must land on the last row that
    // can actually be chosen, not on the one that will do nothing.
    const user = userEvent.setup();
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>
          <button type="button">Open</button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={() => undefined}>Edit</DropdownMenuItem>
          <DropdownMenuItem disabled onSelect={() => undefined}>
            Move down
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    screen.getByRole("button", { name: "Open" }).focus();
    await user.keyboard("{ArrowDown}{End}");

    expect(screen.getByRole("menuitem", { name: "Edit" })).toHaveFocus();
  });

  it("chooses the focused row with Enter, exactly as a click does", async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<Menu onPick={onPick} />);

    screen.getByRole("button", { name: "Open" }).focus();
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");

    expect(onPick).toHaveBeenCalledExactlyOnceWith("Hide");
    expect(screen.queryByRole("menuitem")).toBeNull();
    // And the reader is left on the trigger. Choosing removes the row they
    // were standing on, which otherwise drops them on <body> — the same
    // defect as an Escape that hands focus nowhere.
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Open" })).toHaveFocus();
    });
  });

  it("leaves focus alone when the row it chose sent the reader elsewhere", async () => {
    // A row that opens a dialog or moves the page has a better answer about
    // where to stand than the trigger does, so the trigger only claims focus
    // that nothing else wanted.
    const user = userEvent.setup();
    render(
      <div>
        <input aria-label="Elsewhere" />
        <DropdownMenu>
          <DropdownMenuTrigger>
            <button type="button">Open</button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem
              onSelect={() => screen.getByLabelText("Elsewhere").focus()}
            >
              Rename
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>,
    );

    screen.getByRole("button", { name: "Open" }).focus();
    await user.keyboard("{ArrowDown}{Enter}");

    await waitFor(() => {
      expect(screen.getByLabelText("Elsewhere")).toHaveFocus();
    });
  });

  it("chooses the focused row with Space", async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<Menu onPick={onPick} />);

    screen.getByRole("button", { name: "Open" }).focus();
    await user.keyboard("{ArrowDown} ");

    expect(onPick).toHaveBeenCalledExactlyOnceWith("Edit");
    expect(screen.queryByRole("menuitem")).toBeNull();
  });

  it("refuses a disabled row that is clicked and then activated", async () => {
    // A pointer can put focus on a refused row — it is a real element. The
    // keys must go on refusing it there, or the menu would have one way in
    // that skips the row's own guard.
    const user = userEvent.setup();
    const onRefused = vi.fn();
    render(<Menu onRefused={onRefused} />);

    await user.click(screen.getByRole("button", { name: "Open" }));
    await user.click(screen.getByRole("menuitem", { name: "Move up" }));
    await user.keyboard("{Enter}");

    expect(onRefused).not.toHaveBeenCalled();
  });

  it("closes on Escape and hands focus back to the trigger", async () => {
    // The row the reader is standing on stops existing. Without this, focus
    // lands on <body> and a keyboard reader is back at the top of the page.
    const user = userEvent.setup();
    render(<Menu />);

    screen.getByRole("button", { name: "Open" }).focus();
    await user.keyboard("{ArrowDown}{Escape}");

    expect(screen.queryByRole("menuitem")).toBeNull();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Open" })).toHaveFocus();
    });
  });

  it("closes on Tab and leaves focus on the trigger for the browser to carry on from", async () => {
    // One stop in the page's order, not a trap and not a jump to the top. The
    // menu closes and puts focus back on the trigger *without* preventing the
    // key, so Tab's own default action — which runs straight afterwards and
    // starts from wherever focus is by then — carries on to whatever follows
    // the trigger.
    //
    // `fireEvent` rather than `user.tab()` here, and deliberately: user-event
    // works out where Tab lands from the element the key was dispatched on
    // rather than from what holds focus when the default action runs, and
    // that element is the row this handler has just removed. It reports
    // <body> for a menu that in a browser hands focus to the trigger, so it
    // can only measure the handler, not the browser's part.
    const user = userEvent.setup();
    render(<Menu />);

    screen.getByRole("button", { name: "Open" }).focus();
    await user.keyboard("{ArrowDown}");
    fireEvent.keyDown(document.activeElement!, { key: "Tab" });

    expect(screen.queryByRole("menuitem")).toBeNull();
    expect(screen.getByRole("button", { name: "Open" })).toHaveFocus();
  });

  it("keeps exactly one row in the page's tab order", async () => {
    // Roving `tabindex`. Every row tabbable would put a stop between the
    // trigger and the rest of the page for each row the menu happens to have.
    const user = userEvent.setup();
    render(<Menu />);

    screen.getByRole("button", { name: "Open" }).focus();
    await user.keyboard("{ArrowDown}");

    const rows = screen.getAllByRole("menuitem");
    expect(rows.filter((row) => row.tabIndex === 0).map((r) => r.textContent)).toEqual([
      "Edit",
    ]);

    await user.keyboard("{End}");
    expect(rows.filter((row) => row.tabIndex === 0).map((r) => r.textContent)).toEqual([
      "Hide",
    ]);
  });

  it("leaves focus in the menu, but on no row, when a pointer opens it", async () => {
    // Picking out the first row under a pointer that is nowhere near it reads
    // as a choice nobody made — but focus still has to be inside the menu, or
    // Escape has nothing to return from.
    const user = userEvent.setup();
    render(<Menu />);

    await user.click(screen.getByRole("button", { name: "Open" }));

    expect(screen.getByRole("menu")).toHaveFocus();
    expect(
      screen.getAllByRole("menuitem").some((row) => row.tabIndex === 0),
    ).toBe(false);
  });

  it("still chooses a row with the pointer", async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<Menu onPick={onPick} />);

    await user.click(screen.getByRole("button", { name: "Open" }));
    await user.click(screen.getByRole("menuitem", { name: "Hide" }));

    expect(onPick).toHaveBeenCalledExactlyOnceWith("Hide");
    expect(screen.queryByRole("menuitem")).toBeNull();
  });
});

/**
 * A submenu is its own panel, and the keys have to say which one they mean.
 */
function Nested({ onPick = () => undefined }: { onPick?: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <button type="button">Open</button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Appearance</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem onSelect={onPick}>Light</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => undefined}>Dark</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem onSelect={() => undefined}>Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

describe("dropdown submenu keyboard", () => {
  it("opens a submenu with Enter and steps into it", async () => {
    const user = userEvent.setup();
    render(<Nested />);

    screen.getByRole("button", { name: "Open" }).focus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Appearance" })).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(screen.getByRole("menuitem", { name: "Light" })).toHaveFocus();
  });

  it("opens a submenu with ArrowRight", async () => {
    const user = userEvent.setup();
    render(<Nested />);

    screen.getByRole("button", { name: "Open" }).focus();
    await user.keyboard("{ArrowDown}{ArrowRight}");

    expect(screen.getByRole("menuitem", { name: "Light" })).toHaveFocus();
  });

  it("arrows within the submenu, not the menu that owns it", async () => {
    const user = userEvent.setup();
    render(<Nested />);

    screen.getByRole("button", { name: "Open" }).focus();
    await user.keyboard("{ArrowDown}{Enter}{ArrowDown}");

    expect(screen.getByRole("menuitem", { name: "Dark" })).toHaveFocus();
  });

  it("chooses a submenu row with Enter and closes the lot", async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<Nested onPick={onPick} />);

    screen.getByRole("button", { name: "Open" }).focus();
    await user.keyboard("{ArrowDown}{Enter}{Enter}");

    expect(onPick).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menuitem")).toBeNull();
  });

  it("steps back one level on Escape, not out of the menu altogether", async () => {
    const user = userEvent.setup();
    render(<Nested />);

    screen.getByRole("button", { name: "Open" }).focus();
    await user.keyboard("{ArrowDown}{Enter}{Escape}");

    expect(screen.queryByRole("menuitem", { name: "Light" })).toBeNull();
    await waitFor(() => {
      expect(screen.getByRole("menuitem", { name: "Appearance" })).toHaveFocus();
    });
    // And the menu that owns it is still up, with the row that opened the
    // submenu still the one under the reader.
    expect(screen.getByRole("menuitem", { name: "Sign out" })).toBeTruthy();
  });

  it("closes a submenu on ArrowLeft", async () => {
    const user = userEvent.setup();
    render(<Nested />);

    screen.getByRole("button", { name: "Open" }).focus();
    await user.keyboard("{ArrowDown}{Enter}{ArrowLeft}");

    expect(screen.queryByRole("menuitem", { name: "Light" })).toBeNull();
    await waitFor(() => {
      expect(screen.getByRole("menuitem", { name: "Appearance" })).toHaveFocus();
    });
  });

  it("does not pull focus when a pointer opens the submenu", async () => {
    // Hover opens it too. Moving the reader somewhere they never asked to go
    // because a pointer crossed a row would also strand them on <body> the
    // moment the pointer left again.
    const user = userEvent.setup();
    render(<Nested />);

    await user.click(screen.getByRole("button", { name: "Open" }));
    await user.hover(screen.getByRole("menuitem", { name: "Appearance" }));

    expect(screen.getByRole("menuitem", { name: "Light" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Light" })).not.toHaveFocus();
  });
});

describe("dropdown menu roles a caller sets", () => {
  it("keeps a row's own role and checked state, and chooses it from the keyboard", async () => {
    // The sort control's rows are `menuitemradio`: several states of one
    // setting rather than several actions. The keyboard has to reach them by
    // the role the caller gave them, not by the default one.
    const user = userEvent.setup();
    const onChoose = vi.fn();
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>
          <button type="button">Sort</button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem role="menuitemradio" aria-checked onSelect={() => undefined}>
            Suggested
          </DropdownMenuItem>
          <DropdownMenuItem
            role="menuitemradio"
            aria-checked={false}
            onSelect={onChoose}
          >
            Newest
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );

    screen.getByRole("button", { name: "Sort" }).focus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitemradio", { name: "Suggested" })).toHaveFocus();

    await user.keyboard("{ArrowDown}{Enter}");
    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("button", { name: "Sort" }).getAttribute("aria-expanded"),
    ).toBe("false");
  });
});
