import { describe, expect, it } from "bun:test";
import { getTableConfig } from "drizzle-orm/pg-core";
import { Service } from "../domain/aggregates/service.aggregate";
import { serviceMapper } from "../infrastructure/repositories/drizzle/service.mapper";
import { service } from "../../../shared/infrastructure/database/catalog/schemas/service.schema";

function built() {
  const s = Service.create({
    id: "svc-1",
    providerId: "prov-1",
    categoryId: "cat-1",
    sourceLocale: "pt-MZ",
    locationType: "at_provider",
    bookingMode: "priced",
    name: "Corte de cabelo",
    description: "Barbearia",
    actorUserId: "actor-1",
  });
  s.addOption({
    id: "opt-1",
    pricingMode: "fixed",
    amountMinor: 30000,
    currency: "MZN",
    durationMinutes: 30,
    minMinutes: null,
    stepMinutes: null,
    name: "Só cabelo",
  });
  s.update({ imageKeys: ["service/svc-1/1"] });
  s.setTranslation("en-US", "Haircut", null);
  s.setMembers(["member-1", "member-2"]);
  return s;
}

// bookingMode "quote" services carry no options — they carry a quote form
// instead, and every field of it needs to be a non-default value so a mapper
// that quietly falls back to defaults instead of the stored row is caught.
function builtQuote() {
  const s = Service.create({
    id: "svc-2",
    providerId: "prov-2",
    categoryId: "cat-2",
    sourceLocale: "pt-MZ",
    locationType: "remote",
    bookingMode: "quote",
    name: "Consultoria",
    description: "Consultoria personalizada",
    actorUserId: "actor-2",
  });
  s.update({ imageKeys: ["service/svc-2/1"] });
  s.setTranslation("en-US", "Consulting", "Personalised consulting");
  s.setQuoteForm({
    responseHours: 12,
    askDeadline: false,
    askPhotos: false,
    askLocation: false,
    intro: "Conte-nos o que precisa.",
  });
  s.setMembers(["member-3"]);
  return s;
}

/**
 * Runs one aggregate through both directions of the mapper and returns the
 * two `toJSON()` snapshots to compare.
 *
 * `builder` is called twice — once for `before`, once to produce the rows fed
 * to `toPersistence` — because `Service.create()`/`touch()` stamp `new
 * Date()` at call time, so a single aggregate reused for both sides would
 * still need its timestamps patched. Calling it twice instead of cloning
 * keeps every other field independently constructed on both sides, which is
 * the point of the test: nothing about `before` and `after` is shared except
 * what passed through the mapper.
 */
function roundTrip(builder: () => Service) {
  const before = builder().toJSON();
  const rows = serviceMapper.toPersistence(builder());
  const after = serviceMapper
    .toDomain({
      service: { ...rows.service, createdAt: before.createdAt, updatedAt: before.updatedAt },
      options: rows.options.map((o) => ({
        ...o,
        createdAt: before.createdAt,
        updatedAt: before.updatedAt,
      })),
      translations: rows.translations,
      optionTranslations: rows.optionTranslations,
      members: rows.members,
      quoteForm: rows.quoteForm,
    })
    .toJSON();
  return { before, after };
}

describe("serviceMapper", () => {
  it("carries every field of the service row", () => {
    const row = serviceMapper.toPersistence(built()).service;
    expect(row).toMatchObject({
      id: "svc-1",
      providerId: "prov-1",
      categoryId: "cat-1",
      sourceLocale: "pt-MZ",
      locationType: "at_provider",
      bookingMode: "priced",
      status: "draft",
      imageKeys: ["service/svc-1/1"],
    });
  });

  it("carries the options, their prices and their durations", () => {
    const { options } = serviceMapper.toPersistence(built());
    expect(options).toHaveLength(1);
    expect(options[0]).toMatchObject({
      serviceId: "svc-1",
      pricingMode: "fixed",
      amountMinor: 30000,
      durationMinutes: 30,
      minMinutes: null,
      stepMinutes: null,
      isDefault: true,
    });
  });

  it("carries the service's performers", () => {
    const { members } = serviceMapper.toPersistence(built());
    expect(members.map((m) => m.memberId).sort()).toEqual(["member-1", "member-2"]);
    expect(members.every((m) => m.serviceId === "svc-1")).toBe(true);
  });

  it("carries both translations of the service and the option's own", () => {
    const out = serviceMapper.toPersistence(built());
    expect(out.translations.map((t) => t.locale).sort()).toEqual(["en-US", "pt-MZ"]);
    expect(out.optionTranslations).toEqual([
      { optionId: "opt-1", locale: "pt-MZ", name: "Só cabelo" },
    ]);
  });

  it("round-trips the whole aggregate: what toPersistence writes, toDomain reads back exactly", () => {
    // Compares the entire `toJSON()` rather than picking fields, on purpose:
    // picking fields is exactly how this test missed most of `ServiceProps`
    // the first time round — `currency`, `sortOrder`, `isDefault`,
    // `isActive`, translation `name`/`description`, and all of `quoteForm`
    // could have been dropped in either direction and every assertion here
    // would still have passed. A whole-object comparison means a field added
    // to `ServiceProps` and forgotten in the mapper fails this test without
    // anyone having to remember to extend it.
    //
    // createdAt/updatedAt are the only fields patched before comparing, and
    // deliberately not compared as mapper output: `builder()` is called twice
    // (see `roundTrip`), and `Service.create()`/`touch()` stamp `new Date()`
    // each call, so the two aggregates' timestamps differ by construction —
    // that difference belongs to the test setup, not to anything the mapper
    // did. Every other field is real mapper behaviour and is left alone.
    const { before, after } = roundTrip(built);
    expect(after).toEqual(before);
  });

  it("round-trips a quote service: the whole quote form, not just its presence", () => {
    // `built()` above is always bookingMode "priced", so quoteForm is null on
    // both sides of the previous test — a mapper that mapped every quoteForm
    // field to its default (or dropped the table read entirely) would still
    // pass it. This is the case that actually exercises `quoteForm`, with a
    // non-default value in every one of its five fields.
    const { before, after } = roundTrip(builtQuote);
    expect(after).toEqual(before);
  });

  it("no longer carries a buffer or a grid", () => {
    const { columns } = getTableConfig(service);
    const names = columns.map((c) => c.name);
    // They belong to the availability rule now: a provider's day is cut up by
    // how they work, not by which of their services is being looked at.
    expect(names).not.toContain("buffer_minutes");
    expect(names).not.toContain("slot_interval_minutes");
  });

  it("the mapper round-trips without them", () => {
    const row = serviceMapper.toPersistence(built()).service;
    expect(row).not.toHaveProperty("bufferMinutes");
    expect(row).not.toHaveProperty("slotIntervalMinutes");
  });
});
