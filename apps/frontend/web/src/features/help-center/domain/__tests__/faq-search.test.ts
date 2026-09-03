import { describe, expect, it } from "vitest";
import { searchFaq } from "../faq-search";
import type { FaqEntry } from "../faq";

const entries: FaqEntry[] = [
  { id: "whenIPay", categoryId: "customers", question: "Quando é que pago?", answer: "Depois de o prestador confirmar a hora." },
  { id: "paymentMethods", categoryId: "customers", question: "Que métodos de pagamento aceitam?", answer: "Neste momento, M-Pesa (Vodacom)." },
  { id: "team", categoryId: "providers", question: "Posso ter uma equipa?", answer: "Sim. Um estabelecimento convida membros por email." },
];

describe("searchFaq", () => {
  it("returns everything for an empty or blank query", () => {
    expect(searchFaq(entries, "")).toHaveLength(3);
    expect(searchFaq(entries, "   ")).toHaveLength(3);
  });

  it("matches the question and the answer", () => {
    expect(searchFaq(entries, "pago").map((e) => e.id)).toEqual(["whenIPay"]);
    expect(searchFaq(entries, "Vodacom").map((e) => e.id)).toEqual(["paymentMethods"]);
  });

  it("ignores case and diacritics, both ways round", () => {
    // Someone typing on a phone keyboard without accents must still find the
    // accented answer, and vice versa.
    expect(searchFaq(entries, "METODOS").map((e) => e.id)).toEqual(["paymentMethods"]);
    expect(searchFaq(entries, "é que pago").map((e) => e.id)).toEqual(["whenIPay"]);
    expect(searchFaq(entries, "equipa").map((e) => e.id)).toEqual(["team"]);
  });

  it("returns nothing when nothing matches, rather than everything", () => {
    expect(searchFaq(entries, "helicóptero")).toEqual([]);
  });

  it("keeps the given order", () => {
    expect(searchFaq(entries, "a").map((e) => e.id)).toEqual(["whenIPay", "paymentMethods", "team"]);
  });
});
