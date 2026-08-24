import { and, eq, inArray, notExists, sql } from "drizzle-orm";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import {
  service,
  serviceMember,
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
    const members = await db
      .select()
      .from(serviceMember)
      .where(eq(serviceMember.serviceId, serviceId));

    return serviceMapper.toDomain({
      service: row,
      options,
      translations,
      optionTranslations,
      members,
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

      // Same wholesale-replace as options and translations above: clearing a
      // performer has to be expressible, and an upsert can only ever add.
      await tx.delete(serviceMember).where(eq(serviceMember.serviceId, id));
      if (rows.members.length) await tx.insert(serviceMember).values(rows.members);
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

  async findMemberIdForUser(providerId: string, userId: string): Promise<string | null> {
    const [row] = await getDb()
      .select({ id: providerMember.id })
      .from(providerMember)
      .where(and(eq(providerMember.providerId, providerId), eq(providerMember.userId, userId)))
      .limit(1);
    return row?.id ?? null;
  }

  async isProviderOwnerOrAdmin(providerId: string, userId: string): Promise<boolean> {
    const [row] = await getDb()
      .select({ role: providerMember.role })
      .from(providerMember)
      .where(and(eq(providerMember.providerId, providerId), eq(providerMember.userId, userId)))
      .limit(1);
    return row?.role === "owner" || row?.role === "admin";
  }

  async memberBelongsToProvider(providerId: string, memberId: string): Promise<boolean> {
    const [row] = await getDb()
      .select({ id: providerMember.id })
      .from(providerMember)
      .where(and(eq(providerMember.id, memberId), eq(providerMember.providerId, providerId)))
      .limit(1);
    return row !== undefined;
  }

  async unpublishServicesWithoutMembers(
    providerId: string,
  ): Promise<{ serviceId: string; name: string }[]> {
    const db = getDb();
    // One statement: every published service of this provider left with no
    // `service_member` rows goes to draft. A loop reading-then-writing one
    // service at a time would leave the list half-swept for as long as it
    // ran, and any read landing in the middle would see a published listing
    // nobody can deliver.
    const changed = await db
      .update(service)
      .set({ status: "draft", updatedAt: new Date() })
      .where(
        and(
          eq(service.providerId, providerId),
          eq(service.status, "published"),
          notExists(
            db
              .select({ one: sql`1` })
              .from(serviceMember)
              .where(eq(serviceMember.serviceId, service.id)),
          ),
        ),
      )
      .returning({ id: service.id, sourceLocale: service.sourceLocale });

    if (changed.length === 0) return [];

    // A follow-up read rather than a join on the UPDATE: the name has to
    // come from the service's own `source_locale`, which varies per row, and
    // `RETURNING` cannot itself join across to `service_translation`.
    const ids = changed.map((c) => c.id);
    const names = await db
      .select({
        serviceId: serviceTranslation.serviceId,
        locale: serviceTranslation.locale,
        name: serviceTranslation.name,
      })
      .from(serviceTranslation)
      .where(inArray(serviceTranslation.serviceId, ids));

    return changed.map((c) => ({
      serviceId: c.id,
      // The id, not "" — this name reaches a human on the Members page's
      // unpublish banner, and a bullet with nothing on it reads as a bug,
      // not as "a service was unpublished". A service missing its
      // `source_locale` translation is not reachable through the write
      // path, but the banner has to say something identifying either way.
      name: names.find((n) => n.serviceId === c.id && n.locale === c.sourceLocale)?.name ?? c.id,
    }));
  }
}
