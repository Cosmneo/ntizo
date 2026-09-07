import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithRouter } from "@/test/render-with-router";
import { SecurityPage } from "@/features/account/ui/section-pages";

// Two sources, on purpose: the number lives on the profile read model, but
// whether it is verified is an auth fact on the session. The page used to
// read only the first and call any number "confirmed".
const fakes = vi.hoisted(() => ({
  phoneNumber: "+258841234567" as string | null,
  phoneNumberVerified: false,
  sessionPending: false,
}));

vi.mock("@/features/user/viewmodel/use-current-user", () => ({
  useCurrentUser: () => ({
    data: { id: "u1", email: "amelia@example.com", phoneNumber: fakes.phoneNumber },
  }),
}));
vi.mock("@ntizo/auth-client", () => ({
  useSession: () => ({
    data: fakes.sessionPending
      ? null
      : { user: { id: "u1", phoneNumberVerified: fakes.phoneNumberVerified } },
    isPending: fakes.sessionPending,
  }),
}));

const ROUTES = ["/verify-phone", "/forgot-password", "/account"];

beforeEach(() => {
  fakes.phoneNumber = "+258841234567";
  fakes.phoneNumberVerified = false;
  fakes.sessionPending = false;
});

describe("SecurityPage", () => {
  it("does not call a number confirmed just because it exists", async () => {
    await renderWithRouter(<SecurityPage />, { routes: ROUTES });
    expect(screen.getByText(/not confirmed/i)).toBeInTheDocument();
    // Email is confirmed by definition; the phone is the only other badge.
    expect(screen.getAllByText(/^confirmed$/i)).toHaveLength(1);
  });

  it("offers the way to verify a number that is not verified yet", async () => {
    // The whole point of the corrected badge: it tells the reader there is
    // something to do, so the row has to carry the thing to do. Without
    // this the account area had no route to the OTP screen at all.
    await renderWithRouter(<SecurityPage />, { routes: ROUTES });
    expect(screen.getByRole("link", { name: /verify/i })).toHaveAttribute("href", "/verify-phone");
  });

  it("calls the number confirmed when the session says it is, and asks for nothing", async () => {
    fakes.phoneNumberVerified = true;
    await renderWithRouter(<SecurityPage />, { routes: ROUTES });
    expect(screen.queryByText(/not confirmed/i)).not.toBeInTheDocument();
    expect(screen.getAllByText(/^confirmed$/i)).toHaveLength(2);
    expect(screen.queryByRole("link", { name: /verify/i })).not.toBeInTheDocument();
  });

  it("sends someone with no number to the profile, not to a verification screen with nothing to verify", async () => {
    // `/verify-phone` short-circuits to a dead end when the session carries
    // no number: a title, "no phone on account", and a link home. The place
    // to add one is the profile form.
    fakes.phoneNumber = null;
    await renderWithRouter(<SecurityPage />, { routes: ROUTES });
    expect(screen.getByText(/not set/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /add.*number/i })).toHaveAttribute("href", "/account");
    expect(screen.queryByRole("link", { name: /^verify$/i })).not.toBeInTheDocument();
  });

  it("passes no verdict on a number while the session is still loading", async () => {
    // `useSession` starts at `{ data: null, isPending: true }` and fetches
    // only after mount, so a verified number would render "not confirmed"
    // through the server render and the first client paint, then flip.
    fakes.sessionPending = true;
    fakes.phoneNumberVerified = true;
    await renderWithRouter(<SecurityPage />, { routes: ROUTES });
    expect(screen.getByText("+258841234567")).toBeInTheDocument();
    expect(screen.queryByText(/not confirmed/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /verify/i })).not.toBeInTheDocument();
  });

  it("says Not set rather than a blank line for an empty number", async () => {
    fakes.phoneNumber = "";
    await renderWithRouter(<SecurityPage />, { routes: ROUTES });
    expect(screen.getByText(/not set/i)).toBeInTheDocument();
  });

  it("changes the password through the emailed link", async () => {
    await renderWithRouter(<SecurityPage />, { routes: ROUTES });
    expect(screen.getByRole("link", { name: /change password/i })).toHaveAttribute(
      "href",
      "/forgot-password",
    );
  });
});
