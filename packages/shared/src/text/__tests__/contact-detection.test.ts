import { describe, expect, it } from "vitest";
import { findContacts, hasContact } from "../contact-detection";

describe("Mozambican mobile numbers", () => {
  it.each([
    ["841234567", "bare nine digits"],
    ["84 123 4567", "spaced the way people write them"],
    ["84-123-4567", "dashed"],
    ["+258841234567", "with the country code"],
    ["+258 84 123 4567", "country code and spaces"],
    ["258841234567", "country code without the plus sign, no separator"],
    ["258 84 123 4567", "country code without the plus sign, spaced"],
    ["821234567", "Tmcel"],
    ["871234567", "Movitel"],
  ])("catches %s (%s)", (text) => {
    expect(hasContact(`liga-me ${text}`)).toBe(true);
  });

  it.each([
    ["Rua 25 de Setembro nº 1234", "an address"],
    ["custa 8500 meticais", "a price"],
    ["são 12 fotos e 300 metros", "plain quantities"],
    ["911234567", "nine digits that do not start with 8"],
  ])("does not catch %s (%s)", (text) => {
    expect(hasContact(text)).toBe(false);
  });
});

describe("emails and direct-contact links", () => {
  it("catches an email", () => {
    expect(findContacts("escreve para ana@exemplo.co.mz")).toEqual([
      { kind: "email", value: "ana@exemplo.co.mz" },
    ]);
  });

  it("catches a wa.me link", () => {
    expect(hasContact("https://wa.me/258841234567")).toBe(true);
  });

  it("catches a bare mention with no path — a pointer, not a URL", () => {
    expect(hasContact("fala comigo por wa.me")).toBe(true);
  });

  it("leaves an ordinary link alone — a portfolio is not a bypass", () => {
    expect(hasContact("veja o meu trabalho em exemplo.co.mz/galeria")).toBe(false);
  });
});

describe("what it reports", () => {
  it("returns every match, not just the first — including two of the same kind", () => {
    // Two phone numbers, so this only passes if the phone pass collects
    // every match (matchAll) rather than stopping at the first one.
    //
    // Order reflects the pass order over kinds (link, then email, then
    // phone) — not the position each match occupies in the source text.
    // The first phone number appears before the email in the string but is
    // reported after it, because every email is collected before phones are
    // searched for. Within a kind, matches keep left-to-right text order.
    const found = findContacts("84 123 4567 e 82 111 2222 ou ana@exemplo.co.mz");
    expect(found).toEqual([
      { kind: "email", value: "ana@exemplo.co.mz" },
      { kind: "phone", value: "84 123 4567" },
      { kind: "phone", value: "82 111 2222" },
    ]);
  });
});
