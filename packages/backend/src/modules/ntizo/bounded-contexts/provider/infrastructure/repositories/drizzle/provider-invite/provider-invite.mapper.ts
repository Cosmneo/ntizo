import {
  ProviderInvite,
  type ProviderInviteRole,
  type ProviderInviteStatus,
} from "../../../../domain/entities/provider-invite";
import type {
  NewProviderInviteRow,
  ProviderInviteRow,
} from "../../../../../../shared/infrastructure/database/provider";

export const providerInviteMapper = {
  toDomain(row: ProviderInviteRow): ProviderInvite {
    return ProviderInvite.rehydrate({
      id: row.id,
      providerId: row.providerId,
      email: row.email,
      role: row.role as ProviderInviteRole,
      token: row.token,
      status: row.status as ProviderInviteStatus,
      invitedByUserId: row.invitedByUserId,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
    });
  },

  toPersistence(invite: ProviderInvite): NewProviderInviteRow {
    const json = invite.toJSON();
    return {
      id: json.id,
      providerId: json.providerId,
      email: json.email,
      role: json.role,
      token: json.token,
      status: json.status,
      invitedByUserId: json.invitedByUserId,
      expiresAt: json.expiresAt,
      createdAt: json.createdAt,
    };
  },
};
