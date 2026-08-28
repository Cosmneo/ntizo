import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "../lib/utils";

/** Which end of a panel focus lands on. */
type Edge = "first" | "last";

interface DropdownCtx {
  open: boolean;
  /**
   * Where focus goes as the panel appears, or null when a pointer opened it
   * and no row should be picked out. Carried alongside `open` rather than in
   * a ref, so the effect that acts on it reads the same value as the render
   * it is reacting to.
   */
  focusOnOpen: Edge | null;
  setOpen: (v: boolean) => void;
  /** Opens *and* says where focus should land — something `setOpen` cannot. */
  openFocused: (edge: Edge) => void;
  triggerRef: React.RefObject<HTMLElement | null>;
  /**
   * Portalled panels that belong to this menu even though they are not inside
   * its DOM subtree.
   *
   * A submenu renders into `document.body` as a *sibling* of the menu that
   * owns it. The close-on-outside-click check tested `content.contains(target)`
   * and therefore called every submenu click "outside": `mousedown` closed the
   * whole menu, the item unmounted, and the `click` that would have run
   * `onSelect` never happened. Switching workspace and creating a provider both
   * did nothing, silently — and only for real mice, because a synthetic
   * `.click()` fires no `mousedown` and slipped straight through.
   */
  registerPanel: (node: HTMLElement) => () => void;
  ownsTarget: (target: Node) => boolean;
}
/**
 * A child the `asChild` triggers clone. Typed narrowly instead of `any`:
 * the only props these triggers read or override are `onClick` and
 * `onKeyDown`, so that is the whole contract — widening it to `any` would
 * also silence real mistakes in the props object passed to cloneElement.
 */
type ClickableChild = React.ReactElement<
  {
    onClick?: React.MouseEventHandler;
    onKeyDown?: React.KeyboardEventHandler;
  } & Record<string, unknown>
>;

const Ctx = React.createContext<DropdownCtx | null>(null);

/**
 * What one panel tells its own rows: which of them currently holds focus.
 *
 * Provided by both the menu and each submenu, so a row reads the level it is
 * actually in rather than the outermost one.
 */
const PanelContext = React.createContext<{ activeId: string | null } | null>(
  null,
);

/**
 * Every row of one panel that can still be chosen, in the order it is drawn.
 *
 * Read off the DOM rather than from rows registering themselves as they
 * mount: the rows are written by whoever uses the menu — some conditional,
 * some inside fragments, some reordered as the list they act on changes — and
 * the panel element is the only thing that reliably knows the order they
 * ended up in. A submenu is a portal of its own and so never appears here,
 * which is what keeps each level's arrow keys to its own rows.
 *
 * Disabled rows are left out rather than stepped over at each call site, so
 * "skip the ones that are refused" holds for Home and End as much as for the
 * arrows, and cannot be forgotten in one place.
 */
function rowsIn(panel: HTMLElement): HTMLElement[] {
  return Array.from(
    panel.querySelectorAll<HTMLElement>("[data-menu-item]"),
  ).filter((row) => row.getAttribute("aria-disabled") !== "true");
}

/**
 * Moving focus between the rows of one panel.
 *
 * A roving `tabindex` — the focused row at 0, every other at -1 — rather than
 * making each row tabbable. A menu is one control, and Tab should pass over
 * it the way it passes over a select; eight tabbable rows would put eight
 * stops between the trigger and whatever follows it in the page.
 */
function useRovingFocus(panelRef: React.RefObject<HTMLElement | null>) {
  const [activeId, setActiveId] = React.useState<string | null>(null);

  const focusRow = React.useCallback((row: HTMLElement | undefined) => {
    if (!row) return;
    setActiveId(row.dataset.menuItem ?? null);
    row.focus();
  }, []);

  const focusEdge = React.useCallback(
    (edge: Edge) => {
      const panel = panelRef.current;
      if (!panel) return;
      const rows = rowsIn(panel);
      focusRow(edge === "first" ? rows[0] : rows[rows.length - 1]);
    },
    [panelRef, focusRow],
  );

  /**
   * The keys that only move between rows or pick one — the same at every
   * level, which is why a submenu borrows them. It answers whether it took
   * the key, so each panel can still give Escape and Tab the meaning they
   * have at its own depth.
   */
  const handleRowKeys = React.useCallback(
    (event: React.KeyboardEvent): boolean => {
      const panel = panelRef.current;
      if (!panel) return false;
      const rows = rowsIn(panel);
      if (rows.length === 0) return false;
      const at = rows.indexOf(document.activeElement as HTMLElement);
      // Off the rows entirely — the panel itself holds focus after a pointer
      // opened it, or a refused row was clicked — so either arrow starts from
      // an end rather than from nowhere.
      const step = (delta: 1 | -1) =>
        at < 0
          ? delta === 1
            ? 0
            : rows.length - 1
          : (at + delta + rows.length) % rows.length;

      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          focusRow(rows[step(1)]);
          return true;
        case "ArrowUp":
          event.preventDefault();
          focusRow(rows[step(-1)]);
          return true;
        case "Home":
          event.preventDefault();
          focusRow(rows[0]);
          return true;
        case "End":
          event.preventDefault();
          focusRow(rows[rows.length - 1]);
          return true;
        case "Enter":
        case " ": {
          // Nothing choosable under focus: the panel itself, or a row that is
          // shown but refused. Left unhandled rather than swallowed.
          if (at < 0) return false;
          event.preventDefault();
          // The click a mouse would have made, rather than a second path into
          // the same row. `onSelect`, the close, and whatever the caller hung
          // on the row cannot drift apart from the pointer's behaviour if
          // there is only ever one of them.
          rows[at]?.click();
          return true;
        }
        default:
          return false;
      }
    },
    [panelRef, focusRow],
  );

  return { activeId, setActiveId, focusEdge, handleRowKeys };
}

export function DropdownMenu({ children }: { children: React.ReactNode }) {
  const [{ open, focusOnOpen }, setState] = React.useState<{
    open: boolean;
    focusOnOpen: Edge | null;
  }>({ open: false, focusOnOpen: null });
  const triggerRef = React.useRef<HTMLElement>(null);
  // A ref, not state: registration happens during layout and must not schedule
  // a render, and nothing renders off this set — it is only read inside event
  // handlers.
  const panels = React.useRef(new Set<HTMLElement>());

  const setOpen = React.useCallback(
    (v: boolean) => setState({ open: v, focusOnOpen: null }),
    [],
  );
  const openFocused = React.useCallback(
    (edge: Edge) => setState({ open: true, focusOnOpen: edge }),
    [],
  );

  const registerPanel = React.useCallback((node: HTMLElement) => {
    panels.current.add(node);
    return () => {
      panels.current.delete(node);
    };
  }, []);

  const ownsTarget = React.useCallback(
    (target: Node) =>
      triggerRef.current?.contains(target) === true ||
      [...panels.current].some((el) => el.contains(target)),
    [],
  );

  const value = React.useMemo(
    () => ({
      open,
      focusOnOpen,
      setOpen,
      openFocused,
      triggerRef,
      registerPanel,
      ownsTarget,
    }),
    [open, focusOnOpen, setOpen, openFocused, registerPanel, ownsTarget],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function DropdownMenuTrigger({
  asChild: _asChild,
  children,
}: {
  asChild?: boolean;
  children: React.ReactElement;
}) {
  const ctx = React.useContext(Ctx)!;
  // Narrow once and read from the narrowed value: `children` is declared as
  // a bare ReactElement, whose `props` is `unknown` under React 19's types.
  const child = children as ClickableChild;
  return React.cloneElement(child, {
    ref: ctx.triggerRef,
    "aria-haspopup": "menu",
    "aria-expanded": ctx.open,
    onClick: (e: React.MouseEvent) => {
      child.props.onClick?.(e);
      ctx.setOpen(!ctx.open);
    },
    /**
     * Opening from the keyboard, and saying where focus goes.
     *
     * These keys are taken here rather than left to the button's own
     * activation — which does open the menu, since Enter and Space on a
     * button fire a click — because a click carries no answer to the only
     * question that matters once the panel is up: which row is the reader
     * standing on. `preventDefault` stops that click so the menu is not
     * opened twice, once per route.
     */
    onKeyDown: (e: React.KeyboardEvent) => {
      child.props.onKeyDown?.(e);
      if (e.defaultPrevented) return;
      switch (e.key) {
        case "Enter":
        case " ":
          e.preventDefault();
          if (ctx.open) ctx.setOpen(false);
          else ctx.openFocused("first");
          break;
        case "ArrowDown":
          e.preventDefault();
          if (!ctx.open) ctx.openFocused("first");
          break;
        // Up opens on the last row, which is where a reader reaching upwards
        // for the bottom of a menu expects to arrive.
        case "ArrowUp":
          e.preventDefault();
          if (!ctx.open) ctx.openFocused("last");
          break;
        case "Escape":
          if (ctx.open) ctx.setOpen(false);
          break;
      }
    },
  });
}

export function DropdownMenuContent({
  className,
  align = "start",
  side = "bottom",
  children,
}: {
  className?: string;
  align?: "start" | "end";
  side?: "top" | "bottom" | "right" | "left";
  children: React.ReactNode;
}) {
  const ctx = React.useContext(Ctx)!;
  const ref = React.useRef<HTMLDivElement>(null);
  const [pos, setPos] = React.useState<{ top: number; left: number } | null>(
    null,
  );
  const { activeId, setActiveId, focusEdge, handleRowKeys } =
    useRovingFocus(ref);
  const panel = React.useMemo(() => ({ activeId }), [activeId]);

  React.useLayoutEffect(() => {
    // Measured afresh on every open, and cleared on close. Keeping the last
    // position would show the panel where it used to be for the frame before
    // it is measured — and `pos` is also how the focus effect below knows the
    // panel has stopped being `visibility: hidden`.
    if (!ctx.open) {
      setPos(null);
      return;
    }
    if (!ctx.triggerRef.current) return;
    const t = ctx.triggerRef.current.getBoundingClientRect();
    const c = ref.current?.getBoundingClientRect();
    const width = c?.width ?? 240;
    const height = c?.height ?? 0;
    let top: number;
    let rawLeft: number;
    if (side === "right") {
      rawLeft = t.right + 4;
      top = t.top + t.height - height; // align bottom of popover with bottom of trigger
    } else if (side === "left") {
      rawLeft = t.left - width - 4;
      top = t.top + t.height - height;
    } else {
      top = side === "top" ? t.top - height - 4 : t.bottom + 4;
      rawLeft = align === "end" ? t.right - width : t.left;
    }
    if (top + height > window.innerHeight - 8)
      top = window.innerHeight - height - 8;
    if (top < 8) top = 8;
    const left = Math.max(8, Math.min(rawLeft, window.innerWidth - width - 8));
    setPos({ top, left });
  }, [ctx.open, side, align]);

  /**
   * Focus follows the menu open. Without this the panel was unreachable: it
   * appeared, and the reader was still standing on the trigger with nothing
   * in the tab order to move onto.
   */
  React.useEffect(() => {
    // Not until it has been measured. The panel is `visibility: hidden` for
    // the frame it is being sized in, and a hidden element cannot take focus
    // — the call is simply dropped, which is how a menu that opened from the
    // keyboard left the reader standing on the trigger. It costs nothing in
    // jsdom, which does not model visibility, so only a browser shows it.
    if (!ctx.open || !pos) return;
    if (ctx.focusOnOpen) {
      focusEdge(ctx.focusOnOpen);
      return;
    }
    // A pointer opened it. The panel takes focus, not a row: picking out the
    // first row under a pointer that is nowhere near it reads as a choice
    // nobody made. Focus is still inside the menu, so Escape has somewhere to
    // return from and an arrow steps straight onto a row.
    setActiveId(null);
    ref.current?.focus();
  }, [ctx.open, ctx.focusOnOpen, pos, focusEdge, setActiveId]);

  React.useEffect(() => {
    if (!ctx.open || !ref.current) return;
    const release = ctx.registerPanel(ref.current);
    function onDoc(e: MouseEvent) {
      // Every panel this menu owns, not just this one — a submenu lives in a
      // portal outside this element and its clicks are not "outside".
      if (ctx.ownsTarget(e.target as Node)) return;
      ctx.setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      release();
    };
  }, [ctx.open, ctx.registerPanel, ctx.ownsTarget, ctx.setOpen]);

  function onKeyDown(event: React.KeyboardEvent) {
    const node = ref.current;
    // A submenu portals out of this element while remaining a React child of
    // it, so its keystrokes bubble through here as well. They belong to that
    // level, which reads Escape as "back one step", not "close everything".
    if (!node || !node.contains(event.target as Node)) return;
    if (handleRowKeys(event)) return;
    if (event.key === "Escape") {
      event.preventDefault();
      ctx.setOpen(false);
      // After the panel is gone rather than before it: the row holding focus
      // is about to stop existing, and focus left on <body> drops a keyboard
      // reader back at the top of the document. Same shape as the browse
      // hero's search field, which had this exact defect.
      queueMicrotask(() => ctx.triggerRef.current?.focus());
      return;
    }
    if (event.key === "Tab") {
      // Not prevented, and put back synchronously rather than in a microtask:
      // Tab's own default action runs immediately after this handler and
      // moves on from wherever focus is by then. Landing it on the trigger
      // first is what makes the menu one stop in the page's order — Tab
      // continues to what follows the trigger, Shift+Tab to what precedes it
      // — instead of a trap or a jump to the top.
      ctx.triggerRef.current?.focus();
      ctx.setOpen(false);
    }
  }

  if (!ctx.open || typeof document === "undefined") return null;
  return createPortal(
    <PanelContext.Provider value={panel}>
      <div
        ref={ref}
        role="menu"
        // Focusable only on purpose: a pointer-opened menu parks focus here
        // so it is inside the menu without singling out a row.
        tabIndex={-1}
        onKeyDown={onKeyDown}
        style={pos ? { top: pos.top, left: pos.left } : { visibility: "hidden" }}
        className={cn(
          "fixed z-[9999] min-w-[12rem] overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-popover)] p-1.5 text-[var(--color-popover-foreground)] shadow-2xl outline-none",
          className,
        )}
      >
        {children}
      </div>
    </PanelContext.Provider>,
    document.body,
  );
}

export function DropdownMenuItem({
  className,
  onSelect,
  disabled,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  onSelect?: () => void;
  /**
   * Shown, but refused.
   *
   * Present so an item that is only sometimes available — "move up" on the
   * first row — can stay in place instead of disappearing, which would make
   * the menu a different shape on every row and move the item below it under
   * the pointer. `aria-disabled` rather than removing the handler alone: a
   * screen reader has to be told, not just left with a control that silently
   * does nothing. It is also what the arrow keys read to step over this row,
   * so one attribute keeps the pointer and the keyboard refusing the same set.
   */
  disabled?: boolean;
}) {
  const ctx = React.useContext(Ctx)!;
  const panel = React.useContext(PanelContext);
  const id = React.useId();
  return (
    <div
      role="menuitem"
      aria-disabled={disabled || undefined}
      // How the panel finds its rows and their order, without every row
      // having to announce itself as it mounts.
      data-menu-item={id}
      tabIndex={panel?.activeId === id ? 0 : -1}
      className={cn(
        "flex select-none items-center gap-3 rounded-md px-3 py-2.5 text-sm outline-none",
        disabled
          ? "cursor-not-allowed opacity-40"
          : "cursor-pointer hover:bg-[var(--color-secondary)] focus-visible:bg-[var(--color-secondary)]",
        className,
      )}
      onClick={(e) => {
        if (disabled) return;
        props.onClick?.(e);
        onSelect?.();
        ctx.setOpen(false);
        // Choosing is the end of the menu, and the row that did the choosing
        // stops existing — which drops focus on <body> and a keyboard reader
        // back at the top of the document, the same defect Escape has. Here
        // rather than in the key handler, so the pointer's route out of the
        // menu and the keyboard's leave focus in the same place.
        //
        // Only if nothing else has claimed it by then: `onSelect` frequently
        // opens a dialog or moves the page, and either has a better answer
        // about where the reader should be standing than the trigger does.
        queueMicrotask(() => {
          if (document.activeElement === document.body)
            ctx.triggerRef.current?.focus();
        });
      }}
      {...props}
    >
      {children}
    </div>
  );
}

export function DropdownMenuLabel({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "px-3 py-2 text-xs font-semibold text-[var(--color-muted-foreground)]",
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("-mx-1.5 my-1.5 h-px bg-[var(--color-border)]", className)}
      {...props}
    />
  );
}

interface SubCtx {
  open: boolean;
  /** True when a key opened it, and focus should move onto its first row. */
  focusOnOpen: boolean;
  setOpen: (v: boolean) => void;
  openFocused: () => void;
  triggerRef: React.RefObject<HTMLElement | null>;
}
const SubContext = React.createContext<SubCtx | null>(null);

export function DropdownMenuSub({ children }: { children: React.ReactNode }) {
  const [{ open, focusOnOpen }, setState] = React.useState({
    open: false,
    focusOnOpen: false,
  });
  const triggerRef = React.useRef<HTMLElement>(null);
  const setOpen = React.useCallback(
    (v: boolean) => setState({ open: v, focusOnOpen: false }),
    [],
  );
  const openFocused = React.useCallback(
    () => setState({ open: true, focusOnOpen: true }),
    [],
  );
  const value = React.useMemo(
    () => ({ open, focusOnOpen, setOpen, openFocused, triggerRef }),
    [open, focusOnOpen, setOpen, openFocused],
  );
  return <SubContext.Provider value={value}>{children}</SubContext.Provider>;
}

export function DropdownMenuSubTrigger({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const sub = React.useContext(SubContext)!;
  const panel = React.useContext(PanelContext);
  const id = React.useId();
  return (
    <div
      ref={sub.triggerRef as React.Ref<HTMLDivElement>}
      role="menuitem"
      aria-haspopup="menu"
      aria-expanded={sub.open}
      // A row of the panel it sits in, so the arrows reach it like any other.
      data-menu-item={id}
      tabIndex={panel?.activeId === id ? 0 : -1}
      onMouseEnter={() => sub.setOpen(true)}
      onClick={() => sub.setOpen(!sub.open)}
      /**
       * Opening the submenu and stepping into it.
       *
       * Taken here rather than left to the panel, whose Enter is the click a
       * mouse would make: on this row that only toggles the submenu open and
       * leaves the reader standing outside the thing they just opened.
       * `stopPropagation` is what stops the panel doing it a second time.
       */
      onKeyDown={(event) => {
        if (
          event.key !== "Enter" &&
          event.key !== " " &&
          event.key !== "ArrowRight"
        )
          return;
        event.preventDefault();
        event.stopPropagation();
        sub.openFocused();
      }}
      className={cn(
        "flex cursor-pointer select-none items-center gap-3 rounded-md px-3 py-2.5 text-sm outline-none hover:bg-[var(--color-secondary)] focus-visible:bg-[var(--color-secondary)] data-[state=open]:bg-[var(--color-secondary)]",
        sub.open && "bg-[var(--color-secondary)]",
        className,
      )}
    >
      {children}
      <svg
        className="ml-auto h-4 w-4 opacity-60"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </div>
  );
}

export function DropdownMenuSubContent({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const sub = React.useContext(SubContext)!;
  const parent = React.useContext(Ctx);
  const ref = React.useRef<HTMLDivElement>(null);
  const [pos, setPos] = React.useState<{ top: number; left: number } | null>(
    null,
  );
  const { activeId, focusEdge, handleRowKeys } = useRovingFocus(ref);
  const panel = React.useMemo(() => ({ activeId }), [activeId]);

  React.useLayoutEffect(() => {
    if (!sub.open) {
      setPos(null);
      return;
    }
    if (!sub.triggerRef.current) return;
    const t = sub.triggerRef.current.getBoundingClientRect();
    const c = ref.current?.getBoundingClientRect();
    const width = c?.width ?? 240;
    const height = c?.height ?? 0;
    let left = t.right + 4;
    if (left + width > window.innerWidth - 8) left = t.left - width - 4;
    let top = t.top;
    if (top + height > window.innerHeight - 8)
      top = window.innerHeight - height - 8;
    setPos({ top, left });
  }, [sub.open]);

  /**
   * Only a key opens this with focus. Hover opens it too, and pulling focus
   * across the page because a pointer crossed a row would move the reader
   * somewhere they never asked to go — and strand them on <body> the moment
   * the pointer left again.
   */
  React.useEffect(() => {
    // `pos` for the same reason the menu waits for it: a panel still being
    // measured is `visibility: hidden`, and hidden elements refuse focus.
    if (!sub.open || !sub.focusOnOpen || !pos) return;
    focusEdge("first");
  }, [sub.open, sub.focusOnOpen, pos, focusEdge]);

  React.useEffect(() => {
    if (!sub.open || !ref.current) return;
    // Announce this panel to the menu that owns it, so its outside-click check
    // stops treating clicks in here as outside and closing everything before
    // the click lands.
    const release = parent?.registerPanel(ref.current);
    function onDoc(e: MouseEvent) {
      const target = e.target as Node;
      if (
        ref.current?.contains(target) ||
        sub.triggerRef.current?.contains(target)
      )
        return;
      sub.setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      release?.();
    };
  }, [sub, parent]);

  function onKeyDown(event: React.KeyboardEvent) {
    const node = ref.current;
    if (!node || !node.contains(event.target as Node)) return;
    if (handleRowKeys(event)) return;
    if (event.key === "Escape" || event.key === "ArrowLeft") {
      event.preventDefault();
      // One level, not the lot: this steps back onto the row that opened the
      // submenu, and a second Escape from there closes the menu. Collapsing
      // both at once would lose the reader's place in the outer list.
      sub.setOpen(false);
      queueMicrotask(() => sub.triggerRef.current?.focus());
      return;
    }
    if (event.key === "Tab") {
      // Both levels: Tab leaves the menu entirely, and it leaves from the
      // trigger so the next stop is whatever follows it in the page.
      parent?.triggerRef.current?.focus();
      sub.setOpen(false);
      parent?.setOpen(false);
    }
  }

  if (!sub.open || typeof document === "undefined") return null;
  return createPortal(
    <PanelContext.Provider value={panel}>
      <div
        ref={ref}
        role="menu"
        onMouseLeave={() => sub.setOpen(false)}
        onKeyDown={onKeyDown}
        style={pos ? { top: pos.top, left: pos.left } : { visibility: "hidden" }}
        onClick={() => parent?.setOpen(false)}
        className={cn(
          "fixed z-[10000] min-w-[12rem] overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-popover)] p-1.5 text-[var(--color-popover-foreground)] shadow-2xl outline-none",
          className,
        )}
      >
        {children}
      </div>
    </PanelContext.Provider>,
    document.body,
  );
}
