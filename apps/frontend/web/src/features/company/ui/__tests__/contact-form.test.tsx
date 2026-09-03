import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CurrentUserDTO } from "@ntizo/shared";
import { GraphqlError } from "@/shared/lib/graphql/session-graphql";
import { ContactRequestPage } from "../contact-request-page";
import { renderCompanyPage } from "./render-company-page";

const fakes = vi.hoisted(() => ({ submit: vi.fn() }));
vi.mock("@/features/company/data/contact-request.repository", () => ({
  submitContactRequest: fakes.submit,
}));

function ContactPage() {
  return <ContactRequestPage kind="contact" />;
}
function FeedbackPage() {
  return <ContactRequestPage kind="feedback" />;
}

function user(): CurrentUserDTO {
  return {
    id: "u-1", email: "joana@exemplo.com", role: "customer", status: "active", createdAt: "2026-01-01T00:00:00.000Z",
    name: "Joana Matola", firstName: "Joana", lastName: "Matola", displayName: "Joana", avatarUrl: null, avatarKey: null,
    phoneNumber: null, bio: null, language: "pt-MZ", timezone: "Africa/Maputo", dateOfBirth: null, gender: null,
  };
}

async function fillContact() {
  await userEvent.type(screen.getByLabelText("Name"), "Joana Matola");
  await userEvent.type(screen.getByLabelText("Email"), "joana@exemplo.com");
  await userEvent.type(screen.getByLabelText("Message"), "Gostava de propor uma parceria com a minha escola.");
}

beforeEach(() => {
  fakes.submit.mockReset();
  fakes.submit.mockResolvedValue({ requestId: "7f3a2c9e-1b2d-4e5f-8a9b-0c1d2e3f4a5b", reference: "7F3A2C" });
});
afterEach(() => vi.clearAllMocks());

describe("ContactRequestPage — contact", () => {
  it("validates before sending and lands the refusal beside the field", async () => {
    await renderCompanyPage(ContactPage, "/contact");
    await userEvent.click(screen.getByRole("button", { name: /send message/i }));
    expect(screen.getByText("Tell us your name.")).toBeInTheDocument();
    expect(screen.getByText("We need an email to reply to.")).toBeInTheDocument();
    expect(screen.getByText("Write at least 10 characters.")).toBeInTheDocument();
    expect(fakes.submit).not.toHaveBeenCalled();
  });

  it("sends what was typed, with the locale, the first topic by default, and an empty honeypot", async () => {
    await renderCompanyPage(ContactPage, "/contact");
    await fillContact();
    await userEvent.click(screen.getByRole("button", { name: /send message/i }));

    await waitFor(() => expect(fakes.submit).toHaveBeenCalledTimes(1));
    expect(fakes.submit.mock.calls[0]![0]).toEqual({
      kind: "contact",
      topic: "general",
      name: "Joana Matola",
      email: "joana@exemplo.com",
      message: "Gostava de propor uma parceria com a minha escola.",
      locale: expect.stringMatching(/^en/),
      originPath: null,
      website: "",
    });
  });

  it("replaces the form with the reference and the reply address on success", async () => {
    await renderCompanyPage(ContactPage, "/contact");
    await fillContact();
    await userEvent.click(screen.getByRole("button", { name: /send message/i }));

    expect(await screen.findByRole("heading", { name: "We got your message." })).toBeInTheDocument();
    expect(screen.getByText("Reference: 7F3A2C")).toBeInTheDocument();
    expect(screen.getByText(/We will reply to joana@exemplo.com/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Message")).toBeNull();
  });

  it("says the rate-limit sentence, with the general address, and keeps what was typed", async () => {
    fakes.submit.mockRejectedValue(
      new GraphqlError(200, [{ message: "too many", extensions: { code: "UNPROCESSABLE", originalCode: "CONTACT_RATE_LIMITED" } }]),
    );
    await renderCompanyPage(ContactPage, "/contact");
    await fillContact();
    await userEvent.click(screen.getByRole("button", { name: /send message/i }));

    expect(await screen.findByText(/Try again in an hour, or write to ola@ntizo.co.mz/)).toBeInTheDocument();
    expect(screen.getByLabelText("Message")).toHaveValue("Gostava de propor uma parceria com a minha escola.");
  });

  it("prefills name and email from the session and hides the sign-in hint", async () => {
    const { qc } = await renderCompanyPage(ContactPage, "/contact");
    // The literal key, not an import of `userQueries` (`@/features/user/data/user.repository`):
    // that import is a `ui -> data` edge across features, which the boundaries lint
    // forbids and this suite may not add an exception for (see task-11 report — same
    // literal key `["user", "me"]` this cache uses, matching the precedent already set by
    // `provider/availability/ui/__tests__/availability-page.test.tsx` and
    // `provider/services/ui/__tests__/service-wizard-page.test.tsx`).
    qc.setQueryData(["user", "me"], user());
    await waitFor(() => expect(screen.getByLabelText("Name")).toHaveValue("Joana Matola"));
    expect(screen.getByLabelText("Email")).toHaveValue("joana@exemplo.com");
    expect(screen.queryByText(/have an account/i)).toBeNull();
  });

  it("offers sign-in carrying the way back, when signed out", async () => {
    await renderCompanyPage(ContactPage, "/contact");
    // Scoped to the form: the site header also carries a "Sign in" link
    // (see task-11 amendment #2), so an unscoped query is ambiguous.
    const form = document.querySelector("form")!;
    expect(within(form).getByRole("link", { name: /sign in/i })).toHaveAttribute("href", "/sign-in?next=%2Fcontact");
  });

  it("hides the honeypot from people", async () => {
    await renderCompanyPage(ContactPage, "/contact");
    const trap = document.querySelector('input[name="website"]')!;
    expect(trap).toHaveAttribute("tabindex", "-1");
    expect(trap).toHaveAttribute("aria-hidden", "true");
  });

  it("offers feedback, about and careers at the bottom", async () => {
    await renderCompanyPage(ContactPage, "/contact");
    const strip = screen.getByRole("heading", { name: /see also/i }).parentElement!;
    expect(Array.from(strip.querySelectorAll("a")).map((a) => a.getAttribute("href"))).toEqual(["/feedback?from=%2Fcontact", "/about", "/careers"]);
  });
});

describe("ContactRequestPage — feedback", () => {
  it("lets the email be empty, sends the page it came from, and thanks without a reply line", async () => {
    await renderCompanyPage(FeedbackPage, "/feedback", "/feedback?from=%2Fservices%2Fabc");
    await userEvent.type(screen.getByLabelText("Name"), "Joana Matola");
    await userEvent.type(screen.getByLabelText("Message"), "Gostava de filtrar por bairro na lista de serviços.");
    await userEvent.click(screen.getByRole("button", { name: /send message/i }));

    await waitFor(() => expect(fakes.submit).toHaveBeenCalledTimes(1));
    expect(fakes.submit.mock.calls[0]![0]).toMatchObject({ kind: "feedback", topic: "idea", email: null, originPath: "/services/abc" });
    expect(await screen.findByText("Thank you. We read everything that reaches us.")).toBeInTheDocument();
    expect(screen.queryByText(/We will reply to/)).toBeNull();
  });

  it("sends no origin when nothing carried a `from`", async () => {
    await renderCompanyPage(FeedbackPage, "/feedback");
    await userEvent.type(screen.getByLabelText("Name"), "Joana Matola");
    await userEvent.type(screen.getByLabelText("Message"), "Gostava de filtrar por bairro na lista de serviços.");
    await userEvent.click(screen.getByRole("button", { name: /send message/i }));

    await waitFor(() => expect(fakes.submit).toHaveBeenCalledTimes(1));
    expect(fakes.submit.mock.calls[0]![0]).toMatchObject({ originPath: null });
  });

  it("drops an external `from` rather than sending it as the origin", async () => {
    await renderCompanyPage(FeedbackPage, "/feedback", "/feedback?from=https%3A%2F%2Fevil.test%2Fx");
    await userEvent.type(screen.getByLabelText("Name"), "Joana Matola");
    await userEvent.type(screen.getByLabelText("Message"), "Gostava de filtrar por bairro na lista de serviços.");
    await userEvent.click(screen.getByRole("button", { name: /send message/i }));

    await waitFor(() => expect(fakes.submit).toHaveBeenCalledTimes(1));
    expect(fakes.submit.mock.calls[0]![0]).toMatchObject({ originPath: null });
  });
});
