import {
  ProviderMember,
  type ProviderMemberRole,
} from "../../../../domain/entities/provider-member";
import type {
  NewProviderMemberRow,
  ProviderMemberRow,
} from "../../../../../../shared/infrastructure/database/provider";

export const providerMemberMapper = {
  toDomain(row: ProviderMemberRow): ProviderMember {
    return ProviderMember.rehydrate({
      id: row.id,
      providerId: row.providerId,
      userId: row.userId,
      role: row.role as ProviderMemberRole,
      joinedAt: row.joinedAt,
    });
  },

  toPersistence(member: ProviderMember): NewProviderMemberRow {
    const json = member.toJSON();
    return {
      id: json.id,
      providerId: json.providerId,
      userId: json.userId,
      role: json.role,
      joinedAt: json.joinedAt,
    };
  },
};
