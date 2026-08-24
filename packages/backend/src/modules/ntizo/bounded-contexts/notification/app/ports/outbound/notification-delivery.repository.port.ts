import type { NotificationDelivery } from "../../../domain/aggregates/notification-delivery.aggregate";

export interface NotificationDeliveryRepositoryPort {
  /** Stores a new attempt and returns its assigned id. */
  save(entity: NotificationDelivery): Promise<string>;

  /**
   * Writes a status transition onto an existing row.
   *
   * Separate from `save` rather than an upsert: the two happen at genuinely
   * different moments — one before the network call and one after — and an
   * upsert would let a caller skip the first, which is the whole point of
   * writing the row up front.
   */
  update(id: string, entity: NotificationDelivery): Promise<void>;

  /** For correlating a provider's bounce webhook back to what we sent. */
  findByProviderMessageId(providerMessageId: string): Promise<NotificationDelivery | null>;
}
