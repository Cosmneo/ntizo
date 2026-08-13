import { describe, expect, test } from "vitest";
import {
  CREATES_SERVICE,
  FIRST_STEP,
  isReachable,
  nextStep,
  previousStep,
  stepBlocks,
  stepProgress,
  stepsFor,
  type ServiceStep,
  type ShapeInput,
} from "../wizard-model";
import { emptyDraft } from "../service-draft";

/** An organization selling a fixed-price service: every step the wizard can show. */
const ORGANIZATION_PRICED: ShapeInput = {
  individualProvider: false,
  bookingMode: "priced",
};

describe("stepsFor", () => {
  test("an organization selling a priced service walks all seven steps", () => {
    expect(stepsFor(ORGANIZATION_PRICED)).toEqual([
      "basics",
      "booking",
      "performers",
      "timing",
      "pricing",
      "languages",
      "review",
    ]);
  });

  test("an individual provider is never asked who performs the service", () => {
    // The server seeds their one member on create, so the question has one
    // answer — the same rule `sectionStates` already applies.
    expect(stepsFor({ ...ORGANIZATION_PRICED, individualProvider: true })).not.toContain(
      "performers",
    );
  });

  test("a quote service is never asked for prices", () => {
    // The server refuses options on a quote service (SERVICE_QUOTE_HAS_OPTIONS),
    // so a step collecting them could only produce an unpublishable service.
    expect(stepsFor({ ...ORGANIZATION_PRICED, bookingMode: "quote" })).not.toContain("pricing");
  });

  test("an individual provider quoting walks the shortest path", () => {
    expect(stepsFor({ individualProvider: true, bookingMode: "quote" })).toEqual([
      "basics",
      "booking",
      "timing",
      "languages",
      "review",
    ]);
  });

  test("the step that creates the service is always present", () => {
    // Everything after it needs an id to exist. A shape that dropped it would
    // strand the wizard with no way to save.
    for (const individualProvider of [true, false]) {
      for (const bookingMode of ["priced", "quote"] as const) {
        expect(stepsFor({ individualProvider, bookingMode })).toContain(CREATES_SERVICE);
      }
    }
  });

  test("the steps that need a saved service all come after the one that creates it", () => {
    // `pricing` writes options and `languages` writes translations; both are
    // mutations addressed by service id.
    const steps = stepsFor(ORGANIZATION_PRICED);
    const createIndex = steps.indexOf(CREATES_SERVICE);
    for (const needsId of ["pricing", "languages"] as const) {
      expect(steps.indexOf(needsId)).toBeGreaterThan(createIndex);
    }
  });

  test("the first step is the same whatever the shape", () => {
    expect(stepsFor(ORGANIZATION_PRICED)[0]).toBe(FIRST_STEP);
    expect(stepsFor({ individualProvider: true, bookingMode: "quote" })[0]).toBe(FIRST_STEP);
  });
});

describe("nextStep / previousStep", () => {
  const steps = stepsFor(ORGANIZATION_PRICED);

  test("walks forward through the shape it is given", () => {
    expect(nextStep("basics", steps)).toBe("booking");
    expect(nextStep("timing", steps)).toBe("pricing");
  });

  test("skips a step the shape omitted rather than landing on it", () => {
    // `booking` is followed by `performers` for an organization, but an
    // individual provider has no such step — the next one is `timing`.
    const individual = stepsFor({ individualProvider: true, bookingMode: "priced" });
    expect(nextStep("booking", individual)).toBe("timing");
  });

  test("review is terminal", () => {
    expect(nextStep("review", steps)).toBeNull();
  });

  test("the first step has nothing behind it", () => {
    expect(previousStep("basics", steps)).toBeNull();
  });

  test("walks backward through the shape it is given", () => {
    expect(previousStep("pricing", steps)).toBe("timing");
  });
});

describe("isReachable", () => {
  const steps = stepsFor(ORGANIZATION_PRICED);

  test("an unsaved service may only go back", () => {
    // Forward would skip the step that creates it.
    expect(isReachable("basics", "timing", { saved: false }, steps)).toBe(true);
    expect(isReachable("pricing", "timing", { saved: false }, steps)).toBe(false);
  });

  test("the step someone is on is always reachable", () => {
    expect(isReachable("timing", "timing", { saved: false }, steps)).toBe(true);
  });

  test("a saved service may jump to any step", () => {
    // Editing a price should not mean walking five screens to reach it.
    expect(isReachable("review", "basics", { saved: true }, steps)).toBe(true);
    expect(isReachable("basics", "review", { saved: true }, steps)).toBe(true);
  });

  test("a step the shape omitted is never reachable", () => {
    const individual = stepsFor({ individualProvider: true, bookingMode: "priced" });
    expect(isReachable("performers", "review", { saved: true }, individual)).toBe(false);
  });
});

describe("stepProgress", () => {
  test("counts against the shape's own length, not the widest one", () => {
    // An individual provider quoting sees five steps; telling them they are on
    // "3 of 7" would count two screens they will never be shown.
    const individual = stepsFor({ individualProvider: true, bookingMode: "quote" });
    expect(stepProgress("timing", individual)).toEqual({ current: 3, total: 5 });
  });

  test("is one-based at the first step", () => {
    const steps = stepsFor(ORGANIZATION_PRICED);
    expect(stepProgress("basics", steps)).toEqual({ current: 1, total: 7 });
  });
});

describe("stepBlocks", () => {
  /** A draft with the essentials answered — nothing on step 1 left to refuse. */
  const answered = () => ({
    ...emptyDraft("m1"),
    categoryId: "cat-1",
    name: "Haircut",
    locationType: "remote" as const,
  });

  test("the essentials refuse an unanswered category", () => {
    expect(stepBlocks("basics", { ...answered(), categoryId: "" })).toBe(true);
  });

  test("the essentials refuse an unnamed service", () => {
    expect(stepBlocks("basics", { ...answered(), name: "   " })).toBe(true);
  });

  test("the essentials refuse an unanswered location", () => {
    // `""` is the real in-between state: "in person" has been picked but not
    // which kind, and the server has no value for that.
    expect(stepBlocks("basics", { ...answered(), locationType: "" })).toBe(true);
  });

  test("the essentials let a fully answered draft through", () => {
    expect(stepBlocks("basics", answered())).toBe(false);
  });

  test("timing refuses a buffer outside the range the server accepts", () => {
    expect(stepBlocks("timing", { ...answered(), bufferMinutes: 500 })).toBe(true);
    expect(stepBlocks("timing", { ...answered(), bufferMinutes: -1 })).toBe(true);
  });

  test("timing accepts a buffer inside it, zero included", () => {
    expect(stepBlocks("timing", { ...answered(), bufferMinutes: 0 })).toBe(false);
    expect(stepBlocks("timing", { ...answered(), bufferMinutes: 480 })).toBe(false);
  });

  test("a step with nothing to refuse never blocks", () => {
    // Booking mode always carries a real value; performers may legitimately
    // be empty on a draft; pricing, languages and review write through their
    // own mutations rather than the draft.
    for (const step of ["booking", "performers", "pricing", "languages", "review"] as const) {
      expect(stepBlocks(step, { ...answered(), categoryId: "", bufferMinutes: 900 })).toBe(false);
    }
  });

  test("the essentials do not block on another step's problem", () => {
    // A bad buffer is `timing`'s refusal to make, not step 1's — otherwise
    // Continue on screen one reports a fault on screen four.
    expect(stepBlocks("basics", { ...answered(), bufferMinutes: 900 })).toBe(false);
  });
});

describe("the step union", () => {
  test("every step the type allows appears in the widest shape", () => {
    // Guards against adding a `ServiceStep` the wizard can never route to.
    const all: ServiceStep[] = [
      "basics",
      "booking",
      "performers",
      "timing",
      "pricing",
      "languages",
      "review",
    ];
    expect(stepsFor(ORGANIZATION_PRICED)).toEqual(all);
  });
});
