import { describe, expect, it } from "vitest";
import {
  FIRST_STEP,
  STEP_ORDER,
  isReachable,
  nextStep,
  previousStep,
  stepProgress,
  type WizardStep,
} from "../screen-model";
import { ProviderType } from "@ntizo/shared";
import { EMPTY_DRAFT, coerceDraft, slugFrom, type ProviderDraft } from "../draft";
import { firstIncompleteStep, validateStep } from "../validation";

/** Walks the wizard from the first step to the end, collecting every stop. */
function walk(): WizardStep[] {
  const seen: WizardStep[] = [FIRST_STEP];
  let step: WizardStep | null = FIRST_STEP;
  while ((step = nextStep(step))) {
    seen.push(step);
    if (seen.length > 20) throw new Error("nextStep never terminates");
  }
  return seen;
}

describe("wizard navigation", () => {
  it("visits every step, in order, exactly once", () => {
    expect(walk()).toEqual([...STEP_ORDER]);
  });

  it("ends, rather than looping", () => {
    expect(nextStep("review")).toBeNull();
  });

  it("has no way back out of the last step", () => {
    // The provider exists by then. A back button there would re-run creation
    // and make a second one.
    expect(previousStep("review")).toBeNull();
  });

  it("returns from each step to the one before it", () => {
    for (const step of walk().slice(1, -1)) {
      const back = previousStep(step);
      expect(back).not.toBeNull();
      expect(nextStep(back!)).toBe(step);
    }
  });

  it("offers no way back from the very first step", () => {
    expect(previousStep(FIRST_STEP)).toBeNull();
  });

  it("counts every step, so the rail can say how many are left", () => {
    expect(stepProgress("type")).toEqual({ current: 1, total: STEP_ORDER.length });
    expect(stepProgress("review")).toEqual({
      current: STEP_ORDER.length,
      total: STEP_ORDER.length,
    });
  });

  it("lets a rail row go back but never forward", () => {
    // Forward would skip the step that creates the provider, and every step
    // after it needs one to exist.
    expect(isReachable("type", "payout")).toBe(true);
    expect(isReachable("review", "payout")).toBe(false);
    expect(isReachable("payout", "payout")).toBe(true);
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
