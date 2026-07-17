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
  const ctx = useContext(PageHeaderContext);
  useEffect(() => {
    ctx?.setHeader({ title, subtitle });
  }, [title, subtitle, ctx]);
}

export function usePageAction(node: ReactNode, deps: unknown[] = []) {
  const ctx = useContext(PageHeaderContext);
  useEffect(() => {
    ctx?.setAction(node);
    return () => ctx?.setAction(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
