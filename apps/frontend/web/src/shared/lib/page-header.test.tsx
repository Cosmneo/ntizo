import { useState, type ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  PageHeaderContext,
  usePageHeader,
  usePageHeaderValue,
  type PageHeaderState,
} from "@/shared/lib/page-header";

/**
 * Mirrors how ProviderShell supplies the context: header/action in useState,
 * value assembled inline. If usePageHeader depends on the context object
 * itself, every render hands it a new `ctx`, so the effect re-fires, calls
 * setHeader with a fresh object, and re-renders — forever.
 */
function Shell({ children }: { children: ReactNode }) {
  const [header, setHeader] = useState<PageHeaderState>({ title: "" });
  const [action, setAction] = useState<ReactNode>(null);
  return (
    <PageHeaderContext.Provider value={{ header, setHeader, action, setAction }}>
      {children}
    </PageHeaderContext.Provider>
  );
}

let renderCount = 0;

function Page() {
  renderCount++;
  usePageHeader("Welcome", "Get set up as a provider");
  const header = usePageHeaderValue();
  return (
    <div>
      <span data-testid="title">{header.title}</span>
      <span data-testid="subtitle">{header.subtitle ?? ""}</span>
    </div>
  );
}

describe("usePageHeader", () => {
  it("settles instead of re-rendering forever under a shell-style provider", () => {
    renderCount = 0;
    render(
      <Shell>
        <Page />
      </Shell>,
    );

    expect(screen.getByTestId("title").textContent).toBe("Welcome");
    expect(screen.getByTestId("subtitle").textContent).toBe(
      "Get set up as a provider",
    );
    // Mount + the commit that publishes the header. Anything beyond a couple of
    // renders for static title/subtitle means the effect is re-firing.
    expect(renderCount).toBeLessThanOrEqual(3);
  });
});
