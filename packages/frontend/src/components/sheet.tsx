import * as React from "react";
import { cn } from "../lib/utils";

// Minimal Sheet primitive: fixed slide-in panel with backdrop. No Radix.
// Used primarily by the mobile Sidebar.

interface SheetCtx {
  open: boolean;
  setOpen: (v: boolean) => void;
}
/**
 * A child the `asChild` triggers clone. Typed narrowly instead of `any`:
 * the only prop these triggers read or override is `onClick`, so that is the
 * whole contract — widening it to `any` would also silence real mistakes in
 * the props object passed to cloneElement.
 */
type ClickableChild = React.ReactElement<{
  onClick?: React.MouseEventHandler;
}>;

const Ctx = React.createContext<SheetCtx | null>(null);

export function Sheet({
  open: controlledOpen,
  onOpenChange,
  children,
}: {
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
  children: React.ReactNode;
}) {
  const [uncontrolled, setUncontrolled] = React.useState(false);
  const open = controlledOpen ?? uncontrolled;
  const setOpen = React.useCallback(
    (v: boolean) => {
      setUncontrolled(v);
      onOpenChange?.(v);
    },
    [onOpenChange],
  );
  // Stable identity across renders that don't actually change `open` or
  // `onOpenChange` — SheetContent's focus-trap effect keys off this object,
  // and a fresh one on every render (e.g. every keystroke inside the panel,
  // which re-renders the whole tree down to this provider) would tear the
  // trap down and rebuild it mid-render, yanking focus off whatever the
  // caller is actively typing into.
  const value = React.useMemo(() => ({ open, setOpen }), [open, setOpen]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function SheetTrigger({
  asChild: _asChild,
  children,
}: {
  asChild?: boolean;
  children: React.ReactElement;
}) {
  const ctx = React.useContext(Ctx)!;
  // Narrow once and read from the narrowed value: `children` is declared as a
  // bare ReactElement, whose `props` is `unknown` under React 19's types.
  const child = children as ClickableChild;
  return React.cloneElement(child, {
    onClick: (e: React.MouseEvent) => {
      child.props.onClick?.(e);
      ctx.setOpen(true);
    },
  });
}

/** Focusable descendants, in document order — what a focus trap and an initial focus both need. */
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function SheetContent({
  className,
  side = "left",
  style,
  labelledBy,
  children,
}: {
  className?: string;
  side?: "left" | "right" | "top" | "bottom";
  style?: React.CSSProperties;
  /** The id of the heading that names this panel — `aria-labelledby`. Without it a screen reader announces an unnamed dialog. */
  labelledBy?: string;
  children: React.ReactNode;
}) {
  const ctx = React.useContext(Ctx)!;
  const panelRef = React.useRef<HTMLDivElement>(null);
  const open = ctx.open;

  // Escape closes, and focus goes where it came from. Both live in one
  // effect because they share the same "who had focus before this opened"
  // reference: capturing it in a second effect would race this one's
  // cleanup on a fast open-close.
  React.useEffect(() => {
    if (!open) return;
    const returnTo = document.activeElement as HTMLElement | null;

    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
    // The panel itself when it holds nothing focusable — a dialog that
    // leaves focus on the page behind it is not modal in any sense a
    // keyboard user can tell.
    (first ?? panel)?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        ctx.setOpen(false);
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((el) => el.offsetParent !== null || el === panelRef.current);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const firstEl = focusable[0]!;
      const lastEl = focusable[focusable.length - 1]!;
      const active = document.activeElement;
      if (event.shiftKey && (active === firstEl || active === panelRef.current)) {
        event.preventDefault();
        lastEl.focus();
      } else if (!event.shiftKey && active === lastEl) {
        event.preventDefault();
        firstEl.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      // Only if focus is still inside the panel being torn down: a close
      // that already moved focus somewhere deliberate (a navigation) must
      // not have it yanked back.
      if (!returnTo) return;
      if (document.activeElement === document.body || panelRef.current?.contains(document.activeElement)) {
        returnTo.focus();
      }
    };
  }, [open, ctx]);

  if (!open) return null;

  const sideCls =
    side === "left"
      ? "inset-y-0 left-0 h-full border-r"
      : side === "right"
        ? "inset-y-0 right-0 h-full border-l"
        : side === "top"
          ? "inset-x-0 top-0 w-full border-b"
          : "inset-x-0 bottom-0 w-full border-t";

  return (
    <>
      {/* `z-50`, not `z-40`: `MobileNav` is `fixed … z-40` and sits later in
          the document, so at equal z-index it painted over this backdrop and
          stayed tappable behind an open sheet — follow-up #78's second
          defect. The panel goes one higher again. */}
      <div
        data-testid="sheet-backdrop"
        className="fixed inset-0 z-50 bg-black/50"
        onClick={() => ctx.setOpen(false)}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        {...(labelledBy ? { "aria-labelledby": labelledBy } : {})}
        tabIndex={-1}
        className={cn(
          "fixed z-[60] bg-[var(--color-background)] shadow-lg outline-none",
          sideCls,
          className,
        )}
        style={style}
      >
        {children}
      </div>
    </>
  );
}

export function SheetHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1.5", className)} {...props} />;
}

export function SheetTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("text-lg font-semibold", className)} {...props} />;
}

export function SheetDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn("text-sm text-[var(--color-muted-foreground)]", className)}
      {...props}
    />
  );
}
