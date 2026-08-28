import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ProviderPublicDTO } from "@ntizo/shared";
import { ProviderHero } from "../provider-hero";

/**
 * What the title block states, and what it no longer carries.
 *
 * The message button used to live here and now lives in `ProviderRail`,
 * beside the price; its own tests — the thread it starts, the signed-out
 * redirect, the two error sentences — moved with it to
 * `provider-detail-page.test.tsx`, which drives it through the whole
 * assembled page with a real router and a real `useStartThread()`. That is
 * strictly more than this file used to prove: it now takes a page that
 * renders the rail at all, not just a component holding a button. What is
 * left here is this block's own job: name the business, and say only things
 * the platform actually checked.
 *
 * No router and no `QueryClient` any more, because with the button gone this
 * component has neither a link nor a query in it. A provider that needed
 * either would be a provider that had grown a second job.
 */

function provider(over: Partial<ProviderPublicDTO> = {}): ProviderPublicDTO {
  return {
    id: "prov-1",
    name: "Studio Beleza",
    slug: "studio-beleza",
    type: "organization",
    description: "Nine years cutting hair in Maputo.",
    city: "Maputo",
    district: null,
    country: "Mozambique",
    logoUrl: null,
    photoUrls: [],
    verified: false,
    ratingAverage: null,
    reviewCount: 0,
    categories: [],
    serviceCount: 1,
    fromAmountMinor: null,
    fromCurrency: null,
    ...over,
  };
}

describe("ProviderHero", () => {
  it("names the business as the page's only h1", () => {
    render(<ProviderHero provider={provider()} />);
    expect(screen.getByRole("heading", { level: 1, name: /Studio Beleza/ })).toBeInTheDocument();
  });

  it("reads the kind and the trades into one eyebrow", () => {
    render(
      <ProviderHero
        provider={provider({ categories: [{ code: "hair", name: "Hair & beauty" }] })}
      />,
    );
    expect(screen.getByText("Organization · Hair & beauty")).toBeInTheDocument();
  });

  it("badges a verified business", () => {
    render(<ProviderHero provider={provider({ verified: true })} />);
    expect(screen.getByText("Verified")).toBeInTheDocument();
  });

  it("makes no verification claim for a business nobody checked", () => {
    // `verified` means an administrator accepted a document. A badge that is
    // always lit says nothing.
    render(<ProviderHero provider={provider({ verified: false })} />);
    expect(screen.queryByText("Verified")).not.toBeInTheDocument();
  });

  it("does not carry the message button any more", () => {
    // It is in the rail now, beside the price, because the two are one
    // decision. Asserted here rather than left implicit: a button rendered in
    // both places would be a page offering the same action twice.
    render(<ProviderHero provider={provider()} />);
    expect(screen.queryByRole("button", { name: /message/i })).not.toBeInTheDocument();
  });

  it("does not carry the description any more", () => {
    // It moved to the page's own "About" section, under a heading. A
    // paragraph tucked under a rating line is neither findable nor
    // indexable as what it is.
    render(<ProviderHero provider={provider()} />);
    expect(screen.queryByText("Nine years cutting hair in Maputo.")).not.toBeInTheDocument();
  });

  it("does not draw a second picture of the business", () => {
    // The logo tile is gone: the page opens on `DetailGallery`, at full
    // width, and an 80px avatar under it is the same business twice.
    const { container } = render(
      <ProviderHero provider={provider({ logoUrl: "https://cdn.test/logo.png" })} />,
    );
    expect(container.querySelector("img")).toBeNull();
  });
});
