import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithRouter } from "@/test/render-with-router";
import { AccountPage } from "@/features/account/ui/account-page";

vi.mock("@/features/user/viewmodel/use-current-user", () => ({
  useCurrentUser: () => ({
    data: {
      id: "u1",
      email: "amelia@example.com",
      name: "Amélia Sitoe",
      displayName: "Amélia",
      phoneNumber: "+258841234567",
      avatarUrl: null,
      dateOfBirth: "1999-02-06",
      gender: "female",
      language: "en-US",
      timezone: "Africa/Maputo",
      createdAt: "2026-08-14T10:00:00.000Z",
    },
  }),
}));
const fakes = vi.hoisted(() => ({ phoneNumberVerified: false, sessionPending: false }));

vi.mock("@ntizo/auth-client", () => ({
  useSession: () => ({
    data: fakes.sessionPending
      ? null
      : { user: { id: "u1", phoneNumberVerified: fakes.phoneNumberVerified } },
    isPending: fakes.sessionPending,
  }),
}));
vi.mock("@/features/provider/viewmodel/use-providers", () => ({
  useMyProviders: () => ({ data: [] }),
}));

const ROUTES = ["/become-provider"];

beforeEach(() => {
  fakes.phoneNumberVerified = false;
  fakes.sessionPending = false;
});

describe("AccountPage", () => {
  it("says since when this person has been a customer, as a sentence under the name", async () => {
    await renderWithRouter(<AccountPage />, { routes: ROUTES });
    expect(screen.getByText(/customer since/i)).toBeInTheDocument();
  });

  it("shows no figures it cannot fill", async () => {
    // "Average rating given" was a dash for everyone and "Bookings
    // completed" a zero for nearly everyone: tiles that said nothing.
    await renderWithRouter(<AccountPage />, { routes: ROUTES });
    expect(screen.queryByText(/average rating/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/bookings completed/i)).not.toBeInTheDocument();
  });

  it("leaves the language to Preferences, where it is set", async () => {
    await renderWithRouter(<AccountPage />, { routes: ROUTES });
    expect(screen.queryByText(/^language$/i)).not.toBeInTheDocument();
    expect(screen.getByText(/time zone/i)).toBeInTheDocument();
    expect(screen.getByText(/date of birth/i)).toBeInTheDocument();
  });

  it("marks the number as not verified when the session says so", async () => {
    await renderWithRouter(<AccountPage />, { routes: ROUTES });
    expect(screen.getByText(/not verified/i)).toBeInTheDocument();
  });

  it("passes no verdict on the number while the session is still loading", async () => {
    // `useSession` starts pending and fetches only after mount, so a
    // verified number rendered "not verified" through the server render and
    // the first client paint, then flipped.
    fakes.sessionPending = true;
    fakes.phoneNumberVerified = true;
    await renderWithRouter(<AccountPage />, { routes: ROUTES });
    expect(screen.getByText(/\+258841234567/)).toBeInTheDocument();
    expect(screen.queryByText(/not verified/i)).not.toBeInTheDocument();
  });

  it("offers to edit", async () => {
    await renderWithRouter(<AccountPage />, { routes: ROUTES });
    expect(screen.getByRole("button", { name: /edit profile/i })).toBeInTheDocument();
  });
});
