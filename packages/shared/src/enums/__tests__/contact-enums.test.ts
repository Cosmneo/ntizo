import { describe, expect, it } from "vitest";
import {
  CONTACT_REQUEST_KINDS,
  CONTACT_TOPICS,
  isContactTopicForKind,
  contactEmailRequired,
  contactReferenceOf,
} from "../contact-enums";

describe("contact enums", () => {
  it("names the two forms", () => {
    expect(CONTACT_REQUEST_KINDS).toEqual(["contact", "feedback"]);
  });

  it("gives every kind its own topics, ending in a catch-all where the list is a set of reasons", () => {
    expect(CONTACT_TOPICS.contact).toEqual(["general", "partnership", "press", "provider", "other"]);
    expect(CONTACT_TOPICS.feedback).toEqual(["idea", "problem", "praise"]);
  });

  it("refuses a topic that belongs to another kind", () => {
    expect(isContactTopicForKind("contact", "general")).toBe(true);
    expect(isContactTopicForKind("contact", "idea")).toBe(false);
    expect(isContactTopicForKind("feedback", "other")).toBe(false);
  });

  it("only feedback may arrive without a way to reply", () => {
    expect(contactEmailRequired("contact")).toBe(true);
    expect(contactEmailRequired("feedback")).toBe(false);
  });

  it("derives the six-character reference from the id's first hex characters, upper-cased", () => {
    expect(contactReferenceOf("7f3a2c9e-1b2d-4e5f-8a9b-0c1d2e3f4a5b")).toBe("7F3A2C");
  });
});
