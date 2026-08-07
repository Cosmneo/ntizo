import { createContext, useContext, useEffect, type ReactNode } from "react";

export interface PageHeaderState {
  title: string;
  subtitle?: string;
}

export const PageHeaderContext = createContext<{
  header: PageHeaderState;
  setHeader: (h: PageHeaderState) => void;
  action: ReactNode;
  setAction: (a: ReactNode) => void;
} | null>(null);

export function usePageHeaderValue() {
  return useContext(PageHeaderContext)?.header ?? { title: "" };
}

export function usePageHeaderAction() {
  return useContext(PageHeaderContext)?.action ?? null;
}

export function usePageHeader(title: string, subtitle?: string) {
  // Depend on the setter, not the whole context object. Shells build their
  // context value inline, so `ctx` is a new object every render — keeping it
  // in the dep array re-fires this effect on every render, and setHeader's new
  // object defeats React's bail-out, so the two loop forever.
  // useState setters are referentially stable, so this settles.
  const setHeader = useContext(PageHeaderContext)?.setHeader;
  useEffect(() => {
    setHeader?.({ title, subtitle });
  }, [title, subtitle, setHeader]);
}

export function usePageAction(node: ReactNode, deps: unknown[] = []) {
  const setAction = useContext(PageHeaderContext)?.setAction;
  useEffect(() => {
    setAction?.(node);
    return () => setAction?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setAction, ...deps]);
}
