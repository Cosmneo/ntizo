import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type HelpScreen = "home" | "faq" | "requests" | "new" | "conversation";

/** A booking carried into the new-request form — the panel opened from that booking's page. */
export interface HelpPrefill {
  bookingId: string;
  serviceName: string;
}

export interface HelpCenter {
  open: boolean;
  screen: HelpScreen;
  query: string;
  selectedThreadId: string | null;
  prefill: HelpPrefill | null;
  openPanel(options?: { screen?: HelpScreen; prefill?: HelpPrefill }): void;
  close(): void;
  go(screen: HelpScreen): void;
  setQuery(value: string): void;
  openThread(threadId: string): void;
  composeNew(prefill?: HelpPrefill): void;
  back(): void;
}

const Ctx = createContext<HelpCenter | null>(null);

/** Where `back` goes from each screen. `home` is the floor. */
const PARENT: Record<HelpScreen, HelpScreen> = {
  home: "home",
  faq: "home",
  requests: "home",
  new: "home",
  conversation: "requests",
};

/**
 * The panel's state, in one place, mounted once at the root.
 *
 * A context rather than state inside the panel: the launcher is not the only
 * thing that opens it — the footer's "Falar com o suporte", a booking's
 * "need help with this booking", and the `/help` page's own call to action
 * all do, from parts of the tree that render nowhere near it.
 *
 * Which audience a request belongs to is NOT held here. It is a function of
 * the current route (`audienceForPath`), and a copy in state would be a
 * second answer that goes stale the moment somebody navigates with the
 * panel open.
 */
export function HelpCenterProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [screen, setScreen] = useState<HelpScreen>("home");
  const [query, setQuery] = useState("");
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [prefill, setPrefill] = useState<HelpPrefill | null>(null);

  const value = useMemo<HelpCenter>(
    () => ({
      open,
      screen,
      query,
      selectedThreadId,
      prefill,
      openPanel: (options) => {
        setScreen(options?.screen ?? "home");
        if (options?.prefill) setPrefill(options.prefill);
        setOpen(true);
      },
      close: () => {
        setOpen(false);
        // Closing forgets what this visit was about: reopening from the
        // launcher on another page must not resume somebody else's
        // half-written request about a booking they have navigated away from.
        setScreen("home");
        setQuery("");
        setSelectedThreadId(null);
        setPrefill(null);
      },
      go: (next) => setScreen(next),
      setQuery,
      openThread: (threadId) => {
        setSelectedThreadId(threadId);
        setScreen("conversation");
        setOpen(true);
      },
      composeNew: (next) => {
        setPrefill(next ?? null);
        setScreen("new");
        setOpen(true);
      },
      back: () => {
        setScreen((current) => {
          if (current === "conversation") setSelectedThreadId(null);
          return PARENT[current];
        });
      },
    }),
    [open, screen, query, selectedThreadId, prefill],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Throws outside the provider: a button that silently does nothing is worse than a crash in development. */
export function useHelpCenter(): HelpCenter {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useHelpCenter must be used inside a HelpCenterProvider");
  return ctx;
}
