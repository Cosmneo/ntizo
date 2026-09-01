import { describe, expect, it } from "bun:test";
import { toMpesaMsisdn } from "../msisdn";

describe("toMpesaMsisdn", () => {
  it("accepts the three forms a Mozambican number actually arrives in", () => {
    // National, as a customer types it into a form.
    expect(toMpesaMsisdn("841234567")).toBe("258841234567");
    // E.164 with punctuation — what `profile.phone_number` stores, via
    // `normalizePhoneNumber`, and what a customer pastes.
    expect(toMpesaMsisdn("+258 84 123 4567")).toBe("258841234567");
    expect(toMpesaMsisdn("+258841234567")).toBe("258841234567");
    // Country code without the plus.
    expect(toMpesaMsisdn("258 84 123 4567")).toBe("258841234567");
  });

  it("accepts both Vodacom prefixes and no others", () => {
    expect(toMpesaMsisdn("841234567")).toBe("258841234567");
    expect(toMpesaMsisdn("851234567")).toBe("258851234567");
    // Valid Mozambican mobiles on other carriers — Tmcel (82, 83) and
    // Movitel (86, 87). Real numbers, and not ones that can hold an M-Pesa
    // wallet, so refusing them here names the problem better than
    // `INS-2051 MSISDN invalid.` would three seconds later.
    for (const prefix of ["82", "83", "86", "87"]) {
      expect(toMpesaMsisdn(`${prefix}1234567`)).toBeNull();
    }
  });

  /**
   * **The one test in this file that matters most**, and the one it would be
   * easiest to write so it cannot fail.
   *
   * The predecessor platform's normaliser ends with `if (strlen($phone) === 9)
   * { $phone = '258' . $phone; }` — so `123456789` becomes `258123456789`,
   * satisfies its own length-and-country-code check, and is sent at the
   * gateway as if it were a handset. Written as a loop over every wrong
   * leading digit rather than one example, because a single `123456789` would
   * pass against an implementation that happened to reject only `1`.
   */
  it("refuses nine digits with the wrong prefix — the predecessor's bug", () => {
    expect(toMpesaMsisdn("123456789")).toBeNull();

    for (let first = 0; first <= 9; first++) {
      for (let second = 0; second <= 9; second++) {
        const prefix = `${first}${second}`;
        if (prefix === "84" || prefix === "85") continue;
        const nine = `${prefix}1234567`;
        expect(nine).toHaveLength(9);
        expect(toMpesaMsisdn(nine)).toBeNull();
        // And the same number written the two other ways it can arrive: a
        // wrong prefix is wrong whether or not it is carrying a country code.
        expect(toMpesaMsisdn(`258${nine}`)).toBeNull();
        expect(toMpesaMsisdn(`+258${nine}`)).toBeNull();
      }
    }
  });

  it("refuses anything that is not nine national digits", () => {
    expect(toMpesaMsisdn("")).toBeNull();
    expect(toMpesaMsisdn("84123456")).toBeNull(); // eight
    expect(toMpesaMsisdn("8412345678")).toBeNull(); // ten
    expect(toMpesaMsisdn("2588412345678")).toBeNull(); // ten, with a country code
    // A leading zero is deliberately NOT stripped the way the predecessor
    // strips it: Moçambique has no national trunk prefix, so this is ten
    // digits of something else, and rewriting it into a valid number is the
    // same class of mistake as accepting any nine digits.
    expect(toMpesaMsisdn("0841234567")).toBeNull();
  });

  it("refuses letters, and does not mistake them for separators", () => {
    expect(toMpesaMsisdn("84123456a")).toBeNull();
    expect(toMpesaMsisdn("eight41234567")).toBeNull();
    // A `+` anywhere but the front is not a country code marker.
    expect(toMpesaMsisdn("84123+4567")).toBeNull();
  });

  it("ignores the punctuation a stored number actually carries", () => {
    expect(toMpesaMsisdn("(84) 123-4567")).toBe("258841234567");
    expect(toMpesaMsisdn("84.123.4567")).toBe("258841234567");
    expect(toMpesaMsisdn("  +258 84 123 4567  ")).toBe("258841234567");
  });
});
