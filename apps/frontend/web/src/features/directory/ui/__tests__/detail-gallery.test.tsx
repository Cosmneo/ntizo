import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DetailGallery } from "../detail-gallery";

const images = (n: number) => Array.from({ length: n }, (_, i) => `https://cdn.test/${i}.jpg`);

describe("DetailGallery", () => {
  it("renders nothing at all with no photos", () => {
    const { container } = render(<DetailGallery images={[]} alt="Hélder Cossa" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows one photo without offering a gallery to open", () => {
    const { container } = render(<DetailGallery images={images(1)} alt="Hélder Cossa" />);
    expect(container.querySelectorAll("img")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /1/ })).not.toBeInTheDocument();
  });

  it("spans the main tile across both columns when there is no side column", () => {
    // jsdom computes no layout, so there is no rendered width to assert on —
    // the class list is the honest handle here, since it is what CSS Grid
    // itself reads to decide whether the tile occupies one track or two.
    // Without `sm:col-span-2`, the outer grid's two-track template
    // (`1.72fr` / `1fr`) still reserves the second track and CSS Grid's
    // auto-placement leaves it empty next to the one photo.
    const { container: single } = render(<DetailGallery images={images(1)} alt="Hélder Cossa" />);
    const soloTile = single.querySelector("img")!.parentElement!;
    expect(soloTile.className).toContain("sm:col-span-2");

    // And the reverse: once a side column exists, the main tile must give
    // that second track back rather than spanning over it.
    const { container: multi } = render(<DetailGallery images={images(3)} alt="Hélder Cossa" />);
    const mainTile = multi.querySelector("img")!.parentElement!;
    expect(mainTile.className).not.toContain("sm:col-span-2");
  });

  it("shows at most three tiles, however many there are", () => {
    // Counted on the DOM rather than `getAllByRole("img")`: the side tiles
    // carry `alt=""`, which removes them from the accessibility tree
    // entirely (their role becomes `presentation`, not `img`) — so a role
    // query here would only ever find the one labelled tile, not the count
    // of rendered `<img>` elements this test means to pin.
    const { container } = render(<DetailGallery images={images(8)} alt="Hélder Cossa" />);
    expect(container.querySelectorAll("img")).toHaveLength(3);
  });

  it("offers the whole count, not the number of tiles", () => {
    render(<DetailGallery images={images(8)} alt="Hélder Cossa" />);
    expect(screen.getByRole("button", { name: /8/ })).toBeInTheDocument();
  });

  it("opens every photo in a dialog", async () => {
    render(<DetailGallery images={images(8)} alt="Hélder Cossa" />);
    await userEvent.click(screen.getByRole("button", { name: /8/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getAllByRole("img")).toHaveLength(8);
  });

  it("puts a badge over the main tile when given one", () => {
    render(<DetailGallery images={images(3)} alt="x" badge={<span>Documentos verificados</span>} />);
    expect(screen.getByText("Documentos verificados")).toBeInTheDocument();
  });

  it("describes only the main photo, leaving the rest decorative", () => {
    // "photograph 3 of 12" describes nothing. A screen reader gets the one
    // labelled image and skips the tiles.
    //
    // The decorative tiles are asserted on the DOM, not via
    // `getAllByRole("img", { name: "" })`: an `<img alt="">` is presentation,
    // not `img`, in the accessibility tree, so that query would find nothing
    // to count. `getByAltText` still finds them — it reads the `alt`
    // attribute directly rather than going through role/name resolution.
    const { container } = render(<DetailGallery images={images(3)} alt="Hélder Cossa" />);
    expect(screen.getByAltText("Hélder Cossa")).toBeInTheDocument();
    const decorative = [...container.querySelectorAll("img")].filter(
      (img) => img.getAttribute("alt") === "",
    );
    expect(decorative).toHaveLength(2);
  });
});
