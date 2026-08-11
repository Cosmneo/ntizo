import { describe, expect, it } from "vitest";
import { initialsFrom } from "./initials";

describe("initialsFrom", () => {
  it("takes the first letter of the first two words", () => {
    expect(initialsFrom("Estúdio Teste Convites")).toBe("ET");
  });

  it("uses two letters of a single word rather than one", () => {
    // "T" alone in a 36px circle reads as a bullet, not a monogram.
    expect(initialsFrom("teste")).toBe("TE");
  });

  it("reads an email as a name", () => {
    // Rows with no name show the address, and BE — the first two letters of
    // "bernardo" — says less than the person's actual initials.
    expect(initialsFrom("bernardo.cabral@outlook.com")).toBe("BC");
  });

  it("never returns an empty string", () => {
    // An empty avatar is a smudge; a question mark is an answer.
    expect(initialsFrom("")).toBe("?");
    expect(initialsFrom("   ")).toBe("?");
  });

  it("uppercases whatever it finds", () => {
    expect(initialsFrom("salão beleza")).toBe("SB");
  });

  it("keeps accented letters rather than dropping them", () => {
    // "Ótica Óculos" losing both initials would leave nothing.
    expect(initialsFrom("Ótica Óculos")).toBe("ÓÓ");
  });
});
