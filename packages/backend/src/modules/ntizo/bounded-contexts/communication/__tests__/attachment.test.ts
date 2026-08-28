import { describe, expect, it } from "bun:test";
import { sniffContentType } from "../domain/attachment";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]); // %PDF-1
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]); // RIFF....WEBP
const WAV = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]); // RIFF....WAVE
const HTML = new TextEncoder().encode("<!doctype html><script>alert(1)</script>");
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg">');

describe("sniffContentType", () => {
  it.each([
    [JPEG, "image/jpeg"],
    [PNG, "image/png"],
    [PDF, "application/pdf"],
    [WEBP, "image/webp"],
  ])("recognises %#", (bytes, expected) => {
    expect(sniffContentType(bytes)).toBe(expected);
  });

  it("refuses HTML dressed as something else — this is the bypass", () => {
    expect(sniffContentType(HTML)).toBeNull();
  });

  it("refuses SVG, which is an image that can carry script", () => {
    expect(sniffContentType(SVG)).toBeNull();
  });

  it("does not trust a declared type over the bytes", () => {
    // The caller says PDF; the bytes say HTML. The bytes win.
    expect(sniffContentType(HTML)).not.toBe("application/pdf");
  });

  it("checks WEBP at both RIFF (offset 0) and WEBP (offset 8) — a RIFF container alone is not enough", () => {
    // A WAV file is also RIFF-at-0; only the WEBP tag at offset 8 tells them apart.
    expect(sniffContentType(WAV)).toBeNull();
  });
});
