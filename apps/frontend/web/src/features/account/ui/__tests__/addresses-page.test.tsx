import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AddressesPage } from "@/features/account/ui/addresses-page";

const fakes = vi.hoisted(() => ({
  addresses: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/features/account/viewmodel/use-addresses", () => ({
  useMyAddresses: () => ({ data: fakes.addresses, isPending: false }),
  useAddressMutations: () => ({
    add: { mutateAsync: vi.fn(), isPending: false },
    update: { mutateAsync: vi.fn(), isPending: false },
    remove: { mutateAsync: vi.fn(), isPending: false },
  }),
}));

const HOME = {
  id: "a1",
  label: "Casa",
  line1: "Bairro da Liberdade Q29",
  line2: null,
  district: null,
  city: "Maputo",
  country: "MZ",
  directions: null,
  isDefault: true,
};

describe("AddressesPage", () => {
  it("lists an address with its actions on the row", () => {
    fakes.addresses = [HOME];
    render(<AddressesPage />);
    expect(screen.getByText("Casa")).toBeInTheDocument();
    expect(screen.getByText(/Bairro da Liberdade Q29/)).toBeInTheDocument();
    expect(screen.getByText(/^default$/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^edit$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^delete$/i })).toBeInTheDocument();
    // The default one has nothing to be made default of.
    expect(screen.queryByRole("button", { name: /make default/i })).not.toBeInTheDocument();
  });

  it("says so when there are none", () => {
    fakes.addresses = [];
    render(<AddressesPage />);
    expect(screen.getByText(/no addresses yet/i)).toBeInTheDocument();
  });
});
