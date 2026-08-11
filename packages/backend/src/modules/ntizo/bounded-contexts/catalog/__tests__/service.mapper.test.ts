import { describe, expect, it } from "bun:test";
import { Service } from "../domain/aggregates/service.aggregate";
import { serviceMapper } from "../infrastructure/repositories/drizzle/service.mapper";

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
  return s;
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

  it("carries both translations of the service and the option's own", () => {
    const out = serviceMapper.toPersistence(built());
    expect(out.translations.map((t) => t.locale).sort()).toEqual(["en-US", "pt-MZ"]);
    expect(out.optionTranslations).toEqual([
      { optionId: "opt-1", locale: "pt-MZ", name: "Só cabelo" },
    ]);
  });

  it("round-trips: what toPersistence writes, toDomain reads back the same", () => {
    // The check that catches a field carried one way and dropped the other —
    // which is exactly how every logo upload was lost on this project.
    const before = built().toJSON();
    const rows = serviceMapper.toPersistence(built());
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
        quoteForm: rows.quoteForm,
      })
      .toJSON();

    expect(after.imageKeys).toEqual(before.imageKeys);
    expect(after.options.map((o) => o.amountMinor)).toEqual(
      before.options.map((o) => o.amountMinor),
    );
    expect(after.options.map((o) => o.durationMinutes)).toEqual(
      before.options.map((o) => o.durationMinutes),
    );
    expect(after.translations.map((t) => t.locale).sort()).toEqual(
      before.translations.map((t) => t.locale).sort(),
    );
  });
});
