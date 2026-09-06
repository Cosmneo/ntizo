import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { ProviderType } from "@ntizo/shared";

/**
 * How many creations actually reached the server, and a latch that keeps the
 * first one in flight so a second click lands while it is still running —
 * which is the only window in which the bug exists.
 */
const created: unknown[] = [];
let release: (() => void) | undefined;
let pending = false;

const createMut = {
  get isPending() {
    return pending;
  },
  mutateAsync: (body: unknown) => {
    created.push(body);
    pending = true;
    return new Promise<{ providerId: string }>((resolve) => {
      release = () => {
        pending = false;
        resolve({ providerId: "p-created" });
      };
    });
  },
};

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => () => {} }));
vi.mock("@/features/provider/viewmodel/use-provider-mutations", () => ({
  useCreateProvider: () => createMut,
  useUpdateProvider: () => ({ mutateAsync: async () => ({}) }),
}));
vi.mock("@/features/provider/viewmodel/use-active-provider", () => ({
  useActiveProvider: () => ({
    setActive: () => {},
    refresh: async () => {},
    activeProvider: null,
  }),
}));
vi.mock("@/features/provider/viewmodel/use-document-upload", () => ({
  useDocumentUpload: () => ({ mutateAsync: async () => ({}), isPending: false }),
}));

const { useOnboarding } = await import("../use-onboarding");

/** Everything phase 1 asks for, so `firstIncompleteStep` lets the submit through. */
const COMPLETE = {
  type: ProviderType.Individual,
  name: "Flávio Magalhães",
  description: "",
  country: "MZ",
  city: "Maputo",
  district: "",
  street: "",
  postalCode: "",
};

beforeEach(() => {
  created.length = 0;
  release = undefined;
  pending = false;
});

describe("useOnboarding — the wizard submitted twice", () => {
  it("creates one workspace when Continue is pressed twice before the first finishes", async () => {
    // The production bug: three accounts each held two or three identical
    // workspaces created 1.8-3.9 seconds apart. `advance()` fired
    // `create.mutateAsync` with no re-entrancy guard, and nothing in the UI
    // was disabled while it ran, so a second press started a second creation.
    // The duplicate is then a workspace nobody approves — and a service
    // published into it is filtered out of the storefront in silence.
    const { result } = renderHook(() => useOnboarding());

    await act(async () => {
      result.current.patch(COMPLETE);
    });
    // Walk to the step that creates the provider.
    await act(async () => {
      result.current.advance();
    });
    await act(async () => {
      result.current.advance();
    });

    expect(result.current.step).toBe("location");

    // Two presses, the second while the first is still in flight.
    await act(async () => {
      result.current.advance();
      result.current.advance();
    });

    expect(created).toHaveLength(1);

    await act(async () => {
      release?.();
    });
  });

  it("reports that a submit is in flight, so the button can say so", () => {
    // The guard stops the duplicate; this is what stops the second press
    // from being made at all. Without it the person has no feedback and
    // presses again — which is exactly how the gaps came to be seconds wide.
    const { result } = renderHook(() => useOnboarding());
    expect(result.current.submitting).toBe(false);
  });
});
