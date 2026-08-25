export type SuppressionReason = "bounce" | "complaint";

export interface EmailSuppressionRepositoryPort {
  isSuppressed(email: string): Promise<boolean>;

  /**
   * Idempotent. A second bounce for an address already suppressed is not an
   * error and must not rewrite the first reason — the earliest one is why we
   * stopped.
   */
  suppress(input: {
    email: string;
    reason: SuppressionReason;
    detail?: unknown;
  }): Promise<void>;
}
