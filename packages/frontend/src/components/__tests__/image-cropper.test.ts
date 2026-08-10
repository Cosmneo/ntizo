import { describe, expect, it } from "bun:test";
import {
  LOGO_CROP,
  PHOTO_CROP,
  clampView,
  coverScale,
  sourceRect,
} from "../image-cropper";

/** A 4:3 phone photograph, framed square at 300px. */
const PHONE = { w: 4032, h: 3024 };
const SQUARE_FRAME = { w: 300, h: 300 };

describe("coverScale", () => {
  it("fills the frame's tighter axis", () => {
    // Squaring a landscape photo is limited by its height: scale by the
    // height ratio and the width overflows, which is what we want. Scaling by
    // the width ratio instead would leave bars above and below.
    expect(coverScale(PHONE, SQUARE_FRAME)).toBeCloseTo(300 / 3024, 10);
  });

  it("never leaves the frame uncovered on either axis", () => {
    for (const natural of [PHONE, { w: 3024, h: 4032 }, { w: 800, h: 800 }]) {
      const s = coverScale(natural, SQUARE_FRAME);
      expect(natural.w * s).toBeGreaterThanOrEqual(SQUARE_FRAME.w - 1e-9);
      expect(natural.h * s).toBeGreaterThanOrEqual(SQUARE_FRAME.h - 1e-9);
    }
  });
});

describe("clampView", () => {
  const shown = { w: 400, h: 300 };

  it("refuses to pull the image right of the frame's left edge", () => {
    // A positive x would open a gutter on the left. This is the whole reason
    // the clamp exists: any gap shows the grey backing through the crop.
    expect(clampView({ zoom: 1, x: 50, y: 0 }, SQUARE_FRAME, shown).x).toBe(0);
  });

  it("refuses to pull the image past the frame's right edge", () => {
    expect(clampView({ zoom: 1, x: -500, y: 0 }, SQUARE_FRAME, shown).x).toBe(
      SQUARE_FRAME.w - shown.w,
    );
  });

  it("leaves a legal offset alone", () => {
    expect(clampView({ zoom: 1, x: -40, y: 0 }, SQUARE_FRAME, shown).x).toBe(-40);
  });

  it("clamps both axes independently", () => {
    const v = clampView({ zoom: 1, x: 99, y: -999 }, SQUARE_FRAME, shown);
    expect(v).toEqual({ zoom: 1, x: 0, y: SQUARE_FRAME.h - shown.h });
  });
});

describe("sourceRect", () => {
  it("takes the whole short axis at cover scale", () => {
    const scale = coverScale(PHONE, SQUARE_FRAME);
    // Centred: the image is wider than the frame, so it is offset left.
    const x = (SQUARE_FRAME.w - PHONE.w * scale) / 2;
    const r = sourceRect(SQUARE_FRAME, { zoom: 1, x, y: 0 }, scale);

    // The full height of the source, and a square of it.
    expect(r.sh).toBeCloseTo(PHONE.h, 6);
    expect(r.sw).toBeCloseTo(PHONE.h, 6);
    // Horizontally centred within the source.
    expect(r.sx).toBeCloseTo((PHONE.w - PHONE.h) / 2, 6);
    expect(r.sy).toBeCloseTo(0, 10);
  });

  it("never reads outside the image when the view is clamped", () => {
    const scale = coverScale(PHONE, SQUARE_FRAME);
    const shown = { w: PHONE.w * scale, h: PHONE.h * scale };
    // Drag hard in every direction; the clamp is what keeps the read in bounds.
    for (const raw of [
      { zoom: 1, x: 9999, y: 9999 },
      { zoom: 1, x: -9999, y: -9999 },
      { zoom: 1, x: 0, y: -9999 },
    ]) {
      const r = sourceRect(SQUARE_FRAME, clampView(raw, SQUARE_FRAME, shown), scale);
      expect(r.sx).toBeGreaterThanOrEqual(-1e-6);
      expect(r.sy).toBeGreaterThanOrEqual(-1e-6);
      expect(r.sx + r.sw).toBeLessThanOrEqual(PHONE.w + 1e-6);
      expect(r.sy + r.sh).toBeLessThanOrEqual(PHONE.h + 1e-6);
    }
  });

  it("reads a smaller region as the zoom goes up", () => {
    const cover = coverScale(PHONE, SQUARE_FRAME);
    const wide = sourceRect(SQUARE_FRAME, { zoom: 1, x: 0, y: 0 }, cover);
    const tight = sourceRect(SQUARE_FRAME, { zoom: 2, x: 0, y: 0 }, cover * 2);
    expect(tight.sw).toBeCloseTo(wide.sw / 2, 6);
    expect(tight.sh).toBeCloseTo(wide.sh / 2, 6);
  });
});

describe("crop targets", () => {
  it("squares the logo", () => {
    // A wordmark and a face both survive a square. Neither survives being
    // centre-cropped from an arbitrary shape by CSS.
    expect(LOGO_CROP.aspect).toBe(1);
  });

  it("gives portfolio photos one landscape shape", () => {
    expect(PHOTO_CROP.aspect).toBeCloseTo(4 / 3, 10);
  });

  it("exports at a size worth storing but not the original", () => {
    // The point of the resize: a 4032px phone photo becomes 1600px, which is
    // more than any tile needs and a fraction of the bytes.
    expect(PHOTO_CROP.width).toBeLessThan(PHONE.w);
    expect(PHOTO_CROP.width).toBeGreaterThanOrEqual(1200);
    expect(LOGO_CROP.width).toBeLessThanOrEqual(PHOTO_CROP.width);
  });
});
