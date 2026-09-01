import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { canStoreDraftDetails, readDraftDetails, saveDraftDetails } from "../draft-store";

/**
 * The store is the tab's, so it survives between tests the way it survives
 * between pages. Cleared here so each case starts from the state a customer
 * arriving on step 2 for the first time actually has.
 */
beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the checkout draft store", () => {
  it("carries the details to step 3 without writing them to the server", () => {
    // The design's one-write-at-each-end rule: an intermediate mutation would
    // leave a row that is neither an abandoned draft nor a sent request, and
    // a second place for the address to disagree with itself.
    saveDraftDetails("bk-1", { addressId: "addr-2", description: "Portão azul" });
    expect(readDraftDetails("bk-1")).toEqual({ addressId: "addr-2", description: "Portão azul" });
  });

  it("keeps one booking's details out of another's", () => {
    saveDraftDetails("bk-1", { addressId: "addr-2", description: "Portão azul" });
    expect(readDraftDetails("bk-2")).toBeNull();
  });

  it("survives a refresh", () => {
    // sessionStorage rather than component state: the customer who reloads
    // step 2 keeps what they typed. Scoped to the tab, gone when it closes.
    saveDraftDetails("bk-1", { addressId: "addr-2", description: "Portão azul" });
    expect(JSON.parse(sessionStorage.getItem("ntizo.checkout.bk-1") ?? "null")).toMatchObject({
      addressId: "addr-2",
    });
  });

  it("starts the form empty rather than throwing when the browser refuses site data", () => {
    // A private window, or a browser told to block storage, throws on the
    // access itself. Without this case the whole try/catch could be deleted
    // and every test above would still pass — jsdom's storage never fails.
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });

    expect(() =>
      saveDraftDetails("bk-1", { addressId: "addr-2", description: "Portão azul" }),
    ).not.toThrow();
    expect(readDraftDetails("bk-1")).toBeNull();
  });

  it("probes with a write, because a store at its quota reads back perfectly", () => {
    // The failure that matters is the write: step 3 has to read these details
    // back later, and a browser that refuses `setItem` loses them at the
    // confirm step with nothing on screen to explain it. A probe that only
    // read would report this store as healthy.
    expect(canStoreDraftDetails()).toBe(true);

    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(canStoreDraftDetails()).toBe(false);
  });

  it("leaves nothing of its own behind", () => {
    // The probe key is removed, so a customer's tab does not accumulate one
    // entry per page view, and nothing reading this prefix mistakes a probe
    // for somebody's details.
    canStoreDraftDetails();
    expect(sessionStorage.length).toBe(0);
  });

  it("treats a rewritten entry as no entry", () => {
    // The key is a string anybody with a console open can edit. A page that
    // trusted whatever came back would hand step 3 an `addressId` of the
    // wrong type and fail somewhere further along, where the cause is gone.
    sessionStorage.setItem("ntizo.checkout.bk-1", "{not json");
    expect(readDraftDetails("bk-1")).toBeNull();

    sessionStorage.setItem("ntizo.checkout.bk-1", JSON.stringify({ addressId: 42 }));
    expect(readDraftDetails("bk-1")).toEqual({ addressId: null, description: "" });
  });
});
