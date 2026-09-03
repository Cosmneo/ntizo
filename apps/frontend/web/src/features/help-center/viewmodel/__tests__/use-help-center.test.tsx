import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { HelpCenterProvider, useHelpCenter } from "../use-help-center";

const wrapper = ({ children }: { children: ReactNode }) => (
  <HelpCenterProvider>{children}</HelpCenterProvider>
);

describe("useHelpCenter", () => {
  it("starts closed on the home screen", () => {
    const { result } = renderHook(() => useHelpCenter(), { wrapper });
    expect(result.current.open).toBe(false);
    expect(result.current.screen).toBe("home");
  });

  it("opens on a screen and remembers a prefill", () => {
    const { result } = renderHook(() => useHelpCenter(), { wrapper });
    act(() => result.current.openPanel({ screen: "new", prefill: { bookingId: "b-1", serviceName: "Corte" } }));
    expect(result.current.open).toBe(true);
    expect(result.current.screen).toBe("new");
    expect(result.current.prefill).toEqual({ bookingId: "b-1", serviceName: "Corte" });
  });

  it("opening a thread selects it and shows the conversation", () => {
    const { result } = renderHook(() => useHelpCenter(), { wrapper });
    act(() => result.current.openThread("t-1"));
    expect(result.current.screen).toBe("conversation");
    expect(result.current.selectedThreadId).toBe("t-1");
  });

  it("back goes conversation → requests → home, and no further", () => {
    const { result } = renderHook(() => useHelpCenter(), { wrapper });
    act(() => result.current.openThread("t-1"));
    act(() => result.current.back());
    expect(result.current.screen).toBe("requests");
    expect(result.current.selectedThreadId).toBeNull();
    act(() => result.current.back());
    expect(result.current.screen).toBe("home");
    act(() => result.current.back());
    expect(result.current.screen).toBe("home");
  });

  it("closing forgets the prefill and the search, and keeps the panel closed", () => {
    const { result } = renderHook(() => useHelpCenter(), { wrapper });
    act(() => result.current.composeNew({ bookingId: "b-1", serviceName: "Corte" }));
    act(() => result.current.setQuery("reembolso"));
    act(() => result.current.close());
    expect(result.current.open).toBe(false);
    expect(result.current.prefill).toBeNull();
    expect(result.current.query).toBe("");
  });

  it("throws outside the provider rather than silently doing nothing", () => {
    expect(() => renderHook(() => useHelpCenter())).toThrow(/HelpCenterProvider/);
  });
});
