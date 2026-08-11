import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import {
  service,
  serviceOption,
  serviceOptionTranslation,
  serviceQuoteForm,
  serviceTranslation,
} from "../../../../../shared/infrastructure/database/catalog/schemas";
import { providerMember } from "../../../../../shared/infrastructure/database/provider/schemas";
import type { Service } from "../../../domain/aggregates/service.aggregate";
import type { ServiceRepositoryPort } from "../../../app/ports/outbound/service.repository.port";
import { serviceMapper } from "./service.mapper";

export class DrizzleServiceRepository implements ServiceRepositoryPort {
  async findById(serviceId: string): Promise<Service | null> {
    const db = getDb();
    const [row] = await db.select().from(service).where(eq(service.id, serviceId)).limit(1);
    if (!row) return null;

    const options = await db
      .select()
      .from(serviceOption)
      .where(eq(serviceOption.serviceId, serviceId));
    const translations = await db
      .select()
      .from(serviceTranslation)
      .where(eq(serviceTranslation.serviceId, serviceId));
    const optionIds = options.map((o) => o.id);
    const optionTranslations = optionIds.length
      ? await db
          .select()
          .from(serviceOptionTranslation)
          .where(inArray(serviceOptionTranslation.optionId, optionIds))
      : [];
    const [quoteForm] = await db
      .select()
      .from(serviceQuoteForm)
      .where(eq(serviceQuoteForm.serviceId, serviceId))
      .limit(1);

    return serviceMapper.toDomain({
      service: row,
      options,
      translations,
      optionTranslations,
      quoteForm: quoteForm ?? null,
    });
  }

  async save(aggregate: Service): Promise<void> {
    const rows = serviceMapper.toPersistence(aggregate);

    await getDb().transaction(async (tx) => {
      // The update set is derived rather than hand-listed: a field added to the
      // row and forgotten here is a field that silently never persists.
      const { id, providerId: _providerId, createdAt: _createdAt, ...mutable } = rows.service;
      await tx
        .insert(service)
        .values(rows.service)
        .onConflictDoUpdate({ target: service.id, set: mutable });

      // Children replaced wholesale. Removing an option or clearing a
      // translation has to be expressible, and an upsert can only ever add.
      await tx.delete(serviceOption).where(eq(serviceOption.serviceId, id));
      if (rows.options.length) await tx.insert(serviceOption).values(rows.options);

      await tx.delete(serviceTranslation).where(eq(serviceTranslation.serviceId, id));
      if (rows.translations.length) await tx.insert(serviceTranslation).values(rows.translations);

      if (rows.optionTranslations.length) {
        await tx.insert(serviceOptionTranslation).values(rows.optionTranslations);
      }

      await tx.delete(serviceQuoteForm).where(eq(serviceQuoteForm.serviceId, id));
      if (rows.quoteForm) await tx.insert(serviceQuoteForm).values(rows.quoteForm);
    });
  }

  async delete(serviceId: string): Promise<void> {
    await getDb().delete(service).where(eq(service.id, serviceId));
  }

  async isProviderMember(providerId: string, userId: string): Promise<boolean> {
    const [row] = await getDb()
      .select({ id: providerMember.id })
      .from(providerMember)
      .where(and(eq(providerMember.providerId, providerId), eq(providerMember.userId, userId)))
      .limit(1);
    return row !== undefined;
  }
}
