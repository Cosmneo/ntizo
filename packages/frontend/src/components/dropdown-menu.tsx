import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "../lib/utils";

interface DropdownCtx {
  open: boolean;
  setOpen: (v: boolean) => void;
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
 * the only prop these triggers read or override is `onClick`, so that is the
 * whole contract — widening it to `any` would also silence real mistakes in
 * the props object passed to cloneElement.
 */
type ClickableChild = React.ReactElement<
  { onClick?: React.MouseEventHandler } & Record<string, unknown>
>;

const Ctx = React.createContext<DropdownCtx | null>(null);

export function DropdownMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLElement>(null);
  // A ref, not state: registration happens during layout and must not schedule
  // a render, and nothing renders off this set — it is only read inside event
  // handlers.
  const panels = React.useRef(new Set<HTMLElement>());

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
    () => ({ open, setOpen, triggerRef, registerPanel, ownsTarget }),
    [open, registerPanel, ownsTarget],
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
    onClick: (e: React.MouseEvent) => {
      child.props.onClick?.(e);
      ctx.setOpen(!ctx.open);
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

  React.useLayoutEffect(() => {
    if (!ctx.open || !ctx.triggerRef.current) return;
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
  }, [ctx.open, ctx.registerPanel, ctx.ownsTarget]);

  if (!ctx.open || typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={ref}
      style={pos ? { top: pos.top, left: pos.left } : { visibility: "hidden" }}
      className={cn(
        "fixed z-[9999] min-w-[12rem] overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-popover)] p-1.5 text-[var(--color-popover-foreground)] shadow-2xl",
        className,
      )}
    >
      {children}
    </div>,
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
   * does nothing.
   */
  disabled?: boolean;
}) {
  const ctx = React.useContext(Ctx)!;
  return (
    <div
      role="menuitem"
      aria-disabled={disabled || undefined}
      className={cn(
        "flex select-none items-center gap-3 rounded-md px-3 py-2.5 text-sm outline-none",
        disabled
          ? "cursor-not-allowed opacity-40"
          : "cursor-pointer hover:bg-[var(--color-secondary)]",
        className,
      )}
      onClick={(e) => {
        if (disabled) return;
        props.onClick?.(e);
        onSelect?.();
        ctx.setOpen(false);
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
  setOpen: (v: boolean) => void;
  triggerRef: React.RefObject<HTMLElement | null>;
}
const SubContext = React.createContext<SubCtx | null>(null);

export function DropdownMenuSub({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLElement>(null);
  return (
    <SubContext.Provider value={{ open, setOpen, triggerRef }}>
      {children}
    </SubContext.Provider>
  );
}

export function DropdownMenuSubTrigger({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const sub = React.useContext(SubContext)!;
  return (
    <div
      ref={sub.triggerRef as React.Ref<HTMLDivElement>}
      role="menuitem"
      onMouseEnter={() => sub.setOpen(true)}
      onClick={() => sub.setOpen(!sub.open)}
      className={cn(
        "flex cursor-pointer select-none items-center gap-3 rounded-md px-3 py-2.5 text-sm outline-none hover:bg-[var(--color-secondary)] data-[state=open]:bg-[var(--color-secondary)]",
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

  React.useLayoutEffect(() => {
    if (!sub.open || !sub.triggerRef.current) return;
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
  }, [sub.open, parent]);

  if (!sub.open || typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={ref}
      onMouseLeave={() => sub.setOpen(false)}
      style={pos ? { top: pos.top, left: pos.left } : { visibility: "hidden" }}
      onClick={() => parent?.setOpen(false)}
      className={cn(
        "fixed z-[10000] min-w-[12rem] overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-popover)] p-1.5 text-[var(--color-popover-foreground)] shadow-2xl",
        className,
      )}
    >
      {children}
    </div>,
    document.body,
  );
}
