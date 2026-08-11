import {
  Provider,
  type ProviderStatus,
  type ProviderType,
} from "../../../../domain/aggregates/provider";
import { Address } from "../../../../domain/value-objects/address.vo";
import type {
  NewProviderRow,
  ProviderRow,
} from "../../../../../../shared/infrastructure/database/provider";

export const providerMapper = {
  toDomain(row: ProviderRow): Provider {
    const hasAddress =
      row.addressStreet !== null ||
      row.addressCity !== null ||
      row.addressDistrict !== null ||
      row.addressCountry !== null ||
      row.addressPostalCode !== null;

    return Provider.rehydrate({
      id: row.id,
      ownerUserId: row.ownerUserId,
      type: row.type as ProviderType,
      name: row.name,
      slug: row.slug,
      status: row.status as ProviderStatus,
      description: row.description ?? undefined,
      commissionBps: row.commissionBps,
      logoKey: row.logoKey ?? undefined,
      photoKeys: row.photoKeys ?? undefined,
      address: hasAddress
        ? Address.create({
            street: row.addressStreet ?? undefined,
            city: row.addressCity ?? undefined,
            district: row.addressDistrict ?? undefined,
            country: row.addressCountry ?? undefined,
            postalCode: row.addressPostalCode ?? undefined,
            lat: row.addressLat ?? undefined,
            lng: row.addressLng ?? undefined,
          })
        : undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  },

  toPersistence(provider: Provider): NewProviderRow {
    const json = provider.toJSON();
    return {
      id: json.id,
      ownerUserId: json.ownerUserId,
      type: json.type,
      name: json.name,
      slug: json.slug,
      status: json.status,
      description: json.description ?? null,
      commissionBps: json.commissionBps,
      // Missing in both directions until now, and that is where every logo
      // upload was lost: the route stored the object, the mutation accepted
      // the key, the aggregate held it — and the row handed to Postgres simply
      // had no such field, so the column stayed null and the UI reported
      // success.
      logoKey: json.logoKey ?? null,
      photoKeys: json.photoKeys ?? null,
      addressStreet: json.address?.street ?? null,
      addressCity: json.address?.city ?? null,
      addressDistrict: json.address?.district ?? null,
      addressCountry: json.address?.country ?? null,
      addressPostalCode: json.address?.postalCode ?? null,
      addressLat: json.address?.lat ?? null,
      addressLng: json.address?.lng ?? null,
      createdAt: json.createdAt,
      updatedAt: json.updatedAt,
    };
  },
};
