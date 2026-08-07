import type { Profile } from "../../../domain/aggregates/profile.aggregate";

export interface ProfileRepositoryPort {
  findByUserId(userId: string): Promise<Profile | null>;
  save(profile: Profile): Promise<void>;
}
