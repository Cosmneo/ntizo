import { describe, expect, it } from "vitest";
import {
  EMPTY_FILTERS,
  filterPeople,
  hasActiveFilters,
  toPeopleRows,
} from "../people";
import type { ProviderInvite, ProviderMember } from "../types";

const owner: ProviderMember = {
  userId: "u1",
  email: "Pedro@example.com",
  name: "Pedro Carreiro",
  role: "owner",
  joinedAt: "2026-06-22T00:00:00.000Z",
};
const admin: ProviderMember = {
  userId: "u2",
  email: "salif@example.com",
  name: "Salif Faustino",
  role: "admin",
  joinedAt: "2026-06-24T00:00:00.000Z",
};
const pending: ProviderInvite = {
  id: "i1",
  email: "nova@example.com",
  role: "staff",
  status: "pending",
  createdAt: "2026-08-01T00:00:00.000Z",
};

describe("toPeopleRows", () => {
  it("puts members and invitations in one list", () => {
    expect(toPeopleRows([owner, admin], [pending])).toHaveLength(3);
  });

  it("keeps members ahead of invitations", () => {
    // The team is the answer; the invitations are the pending part of it.
    const rows = toPeopleRows([owner], [pending]);
    expect(rows.map((r) => r.kind)).toEqual(["member", "invite"]);
  });

  it("marks a pending invitation as invited, not active", () => {
    expect(toPeopleRows([], [pending])[0]!.status).toBe("invited");
  });

  it("marks anything else as expired", () => {
    // Revoked or expired both read the same to the reader: this will not turn
    // into a member on its own.
    const rows = toPeopleRows([], [{ ...pending, status: "revoked" }]);
    expect(rows[0]!.status).toBe("expired");
  });

  it("drops an invitation the person already accepted", () => {
    // Otherwise one person appears twice — once as a member, once as the
    // invitation that made them one.
    const accepted: ProviderInvite = { ...pending, email: "PEDRO@example.com" };
    const rows = toPeopleRows([owner], [accepted]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.kind).toBe("member");
  });

  it("gives an invitation no name, because nobody has accepted it", () => {
    expect(toPeopleRows([], [pending])[0]!.name).toBeNull();
  });
});

describe("filterPeople", () => {
  const rows = toPeopleRows([owner, admin], [pending]);

  it("returns everything with no filters", () => {
    expect(filterPeople(rows, EMPTY_FILTERS)).toHaveLength(3);
  });

  it("matches a name regardless of case", () => {
    expect(
      filterPeople(rows, { ...EMPTY_FILTERS, query: "salif" }).map(
        (r) => r.email,
      ),
    ).toEqual(["salif@example.com"]);
  });

  it("matches an email, which is all an invitation has", () => {
    const found = filterPeople(rows, { ...EMPTY_FILTERS, query: "nova" });
    expect(found).toHaveLength(1);
    expect(found[0]!.kind).toBe("invite");
  });

  it("ignores surrounding whitespace rather than finding nothing", () => {
    expect(
      filterPeople(rows, { ...EMPTY_FILTERS, query: "  salif  " }),
    ).toHaveLength(1);
  });

  it("filters by role", () => {
    expect(
      filterPeople(rows, { ...EMPTY_FILTERS, role: "owner" }),
    ).toHaveLength(1);
  });

  it("filters by status, across both kinds", () => {
    expect(
      filterPeople(rows, { ...EMPTY_FILTERS, status: "active" }),
    ).toHaveLength(2);
    expect(
      filterPeople(rows, { ...EMPTY_FILTERS, status: "invited" }),
    ).toHaveLength(1);
  });

  it("combines every filter rather than picking one", () => {
    expect(
      filterPeople(rows, { query: "a", role: "owner", status: "invited" }),
    ).toHaveLength(0);
  });
});

describe("hasActiveFilters", () => {
  it("is false for the empty set", () => {
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
  });

  it("does not count a query of only spaces", () => {
    // "Clear filters" would otherwise offer itself for nothing.
    expect(hasActiveFilters({ ...EMPTY_FILTERS, query: "   " })).toBe(false);
  });

  it("is true for a role or a status", () => {
    expect(hasActiveFilters({ ...EMPTY_FILTERS, role: "staff" })).toBe(true);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, status: "expired" })).toBe(
      true,
    );
  });
});
