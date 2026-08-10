import { describe, expect, it } from "vitest";
import {
  FIRST_SCREEN,
  PROVIDER_SUB_ORDER,
  isReachable,
  nextScreen,
  previousScreen,
  subProgress,
  type OnboardingScreen,
} from "../screen-model";
import { ProviderType } from "@ntizo/shared";
import { EMPTY_DRAFT, coerceDraft, slugFrom, type ProviderDraft } from "../draft";
import { firstIncompleteStep, validateStep } from "../validation";

/** Walks the wizard from the first screen to the end, collecting every stop. */
function walk(): OnboardingScreen[] {
  const seen: OnboardingScreen[] = [FIRST_SCREEN];
  let screen: OnboardingScreen | null = FIRST_SCREEN;
  while ((screen = nextScreen(screen))) {
    seen.push(screen);
    if (seen.length > 20) throw new Error("nextScreen never terminates");
  }
  return seen;
}

describe("wizard navigation", () => {
  it("visits every sub-step before leaving the first phase", () => {
    const path = walk();
    expect(path.filter((s) => s.phase === 1).map((s) => (s as { sub: string }).sub)).toEqual([
      ...PROVIDER_SUB_ORDER,
    ]);
  });

  it("ends, rather than looping", () => {
    const path = walk();
    expect(path.at(-1)).toEqual({ phase: 3 });
    expect(nextScreen({ phase: 3 })).toBeNull();
  });

  it("has no way back out of the last screen", () => {
    // The provider exists by then. A back button there would re-run creation
    // and make a second one.
    expect(previousScreen({ phase: 3 })).toBeNull();
  });

  it("returns from each screen to the one before it", () => {
    for (const screen of walk().slice(1, -1)) {
      const back = previousScreen(screen);
      expect(back).not.toBeNull();
      expect(nextScreen(back!)).toEqual(screen);
    }
  });

  it("offers no way back from the very first screen", () => {
    expect(previousScreen(FIRST_SCREEN)).toBeNull();
  });

  it("counts the sub-steps only where there are any", () => {
    expect(subProgress({ phase: 1, sub: "type" })).toEqual({ current: 1, total: 3 });
    expect(subProgress({ phase: 1, sub: "location" })).toEqual({ current: 3, total: 3 });
    expect(subProgress({ phase: 2 })).toBeNull();
  });

  it("lets a chip go back but never forward", () => {
    // Forward would skip the step that creates the provider, and every screen
    // after it needs one to exist.
    expect(isReachable({ phase: 1, sub: "type" }, { phase: 2 })).toBe(true);
    expect(isReachable({ phase: 3 }, { phase: 2 })).toBe(false);
    expect(isReachable({ phase: 2 }, { phase: 2 })).toBe(true);
  });
});

describe("draft", () => {
  it("survives a stored value from an older shape", () => {
    // sessionStorage outlives deploys. A field added since the draft was
    // written would arrive undefined and turn a controlled input uncontrolled.
    const restored = coerceDraft({ name: "Canalizações Namaacha", type: "individual" });
    expect(restored.name).toBe("Canalizações Namaacha");
    expect(restored.city).toBe("");
    expect(Object.keys(restored).sort()).toEqual(Object.keys(EMPTY_DRAFT).sort());
  });

  it("refuses a stored type that is not one of ours", () => {
    // Restoring it would put the wizard on a branch that does not exist.
    expect(coerceDraft({ type: "franchise" }).type).toBe("");
    expect(coerceDraft({ type: 7 }).type).toBe("");
  });

  it("shrugs off anything that is not an object", () => {
    for (const junk of [null, undefined, "", 42, []]) {
      expect(coerceDraft(junk).type).toBe("");
    }
  });

  it("prefills the launch market rather than asking cold", () => {
    expect(EMPTY_DRAFT.country).toBe("MZ");
  });
});

describe("slugFrom", () => {
  it("folds accents rather than dropping the letters", () => {
    // "Canalizações" without the fold becomes "canaliza-es", which is not a
    // name anybody would recognise in a URL.
    expect(slugFrom("Canalizações Namaacha")).toBe("canalizacoes-namaacha");
    expect(slugFrom("Salão da Célia")).toBe("salao-da-celia");
  });

  it("leaves no stray separators at either end", () => {
    expect(slugFrom("  Oficina do Zé!  ")).toBe("oficina-do-ze");
    expect(slugFrom("— A —")).toBe("a");
  });

  it("returns something bounded for a name that is not", () => {
    expect(slugFrom("a".repeat(200)).length).toBeLessThanOrEqual(60);
  });
});

describe("validation", () => {
  const filled: ProviderDraft = {
    ...EMPTY_DRAFT,
    type: ProviderType.Individual,
    name: "Canalizações Namaacha",
    city: "Namaacha",
  };

  it("reports every problem in a step at once", () => {
    // Fixing one error only to be shown the next is what makes people give up.
    const errors = validateStep("location", { ...EMPTY_DRAFT, country: "", city: "" });
    expect(Object.keys(errors).sort()).toEqual(["city", "country"]);
  });

  it("accepts a complete step", () => {
    for (const step of ["type", "identity", "location"] as const) {
      expect(validateStep(step, filled)).toEqual({});
    }
  });

  it("does not block the application on a payout method", () => {
    // It can be decided later; losing an applicant at the last screen over it
    // would cost more than the missing field.
    expect(firstIncompleteStep({ ...filled, payoutType: "", payoutIdentifier: "" })).toBeNull();
  });

  it("points at the first gap in a half-restored draft", () => {
    expect(firstIncompleteStep(EMPTY_DRAFT)).toBe("type");
    expect(firstIncompleteStep({ ...filled, city: "" })).toBe("location");
    expect(firstIncompleteStep({ ...filled, name: " " })).toBe("identity");
  });
});
