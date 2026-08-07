import * as React from "react";
import { cn } from "../lib/utils";

// Minimal Sheet primitive: fixed slide-in panel with backdrop. No Radix.
// Used primarily by the mobile Sidebar.

interface SheetCtx {
  open: boolean;
  setOpen: (v: boolean) => void;
}
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
  const setOpen = (v: boolean) => {
    setUncontrolled(v);
    onOpenChange?.(v);
  };
  return <Ctx.Provider value={{ open, setOpen }}>{children}</Ctx.Provider>;
}

export function SheetTrigger({
  asChild: _asChild,
  children,
}: {
  asChild?: boolean;
  children: React.ReactElement;
}) {
  const ctx = React.useContext(Ctx)!;
  return React.cloneElement(children as React.ReactElement<any>, {
    onClick: (e: React.MouseEvent) => {
      (children.props as any).onClick?.(e);
      ctx.setOpen(true);
    },
  });
}

export function SheetContent({
  className,
  side = "left",
  style,
  children,
}: {
  className?: string;
  side?: "left" | "right" | "top" | "bottom";
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const ctx = React.useContext(Ctx)!;
  if (!ctx.open) return null;

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
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={() => ctx.setOpen(false)}
      />
      <div
        className={cn(
          "fixed z-50 bg-[var(--color-background)] shadow-lg",
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
