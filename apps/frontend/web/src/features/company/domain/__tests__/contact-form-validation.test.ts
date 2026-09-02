import { describe, expect, it } from "vitest";
import { validateContactForm } from "../contact-form-validation";

const ok = { name: "Joana Matola", email: "joana@exemplo.com", message: "Gostava de propor uma parceria." };

describe("validateContactForm", () => {
  it("passes a complete form", () => {
    expect(validateContactForm(ok, { emailRequired: true })).toEqual({});
  });
  it("needs a name of at least two characters", () => {
    expect(validateContactForm({ ...ok, name: " J " }, { emailRequired: true })).toEqual({ name: "required" });
  });
  it("needs an email when the kind requires one, and a well-formed one whenever one is given", () => {
    expect(validateContactForm({ ...ok, email: "" }, { emailRequired: true })).toEqual({ email: "required" });
    expect(validateContactForm({ ...ok, email: "" }, { emailRequired: false })).toEqual({});
    expect(validateContactForm({ ...ok, email: "joana" }, { emailRequired: false })).toEqual({ email: "invalid" });
  });
  it("needs at least ten characters of message", () => {
    expect(validateContactForm({ ...ok, message: "olá   " }, { emailRequired: true })).toEqual({ message: "tooShort" });
  });
});
