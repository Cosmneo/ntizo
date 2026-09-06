import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

/**
 * Whether the phone's menu sheet is open. Lifted out of the sheet because
 * the thing that opens it — the Menu tab — is a different component in a
 * different part of the frame.
 */
interface ConsoleMenu {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const Ctx = createContext<ConsoleMenu | null>(null);

export function ConsoleMenuProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const value = useMemo(() => ({ open, setOpen }), [open]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useConsoleMenu(): ConsoleMenu {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useConsoleMenu must be used inside ConsoleMenuProvider.");
  return ctx;
}
