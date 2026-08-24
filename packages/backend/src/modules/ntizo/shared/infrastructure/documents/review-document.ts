import { and, eq, inArray } from "drizzle-orm";
import { ProviderDocumentStatus } from "@ntizo/shared";
import { getDb } from "../../../../better-auth/infrastructure/client/drizzle";
import { providerDocument } from "../database/provider/schemas";
import { provider } from "../database/provider/schemas";

export interface ReviewResult {
  /** False when the document was already reviewed or has been superseded. */
  applied: boolean;
  providerId: string | null;
  /** True when this was the last thing holding the account in re-verification. */
  clearedReverification: boolean;
}

/**
 * An administrator's decision about one uploaded document.
 *
 * Only a `pending` row can be decided, and that is enforced in the WHERE
 * rather than checked first: two reviewers opening the same queue is a real
 * thing, and a check-then-write would let the second one overwrite the first's
 * decision with their own. A no-op is reported as `applied: false` rather than
 * thrown, because "somebody else already handled it" is not an error.
 *
 * A superseded row can never be decided at all. The whole reason this table is
 * append-only is that an approved document could otherwise be swapped for a
 * forged one; approving the row that was replaced would launder exactly that.
 */
export async function reviewDocument(input: {
  documentId: string;
  accept: boolean;
  reviewerUserId: string;
  rejectionReason?: string | null;
}): Promise<ReviewResult> {
  return getDb().transaction(async (tx) => {
    const [row] = await tx
      .update(providerDocument)
      .set({
        status: input.accept
          ? ProviderDocumentStatus.Accepted
          : ProviderDocumentStatus.Rejected,
        reviewedByUserId: input.reviewerUserId,
        reviewedAt: new Date(),
        rejectionReason: input.accept ? null : (input.rejectionReason ?? null),
      })
      .where(
        and(
          eq(providerDocument.id, input.documentId),
          eq(providerDocument.status, ProviderDocumentStatus.Pending),
        ),
      )
      .returning({ providerId: providerDocument.providerId });

    if (!row) return { applied: false, providerId: null, clearedReverification: false };

    // With nothing left pending, the flag that says "look at this account
    // again" has done its job. Left set, it would sit on the workspace's own
    // settings page telling the provider they are under review forever.
    const stillPending = await tx
      .select({ id: providerDocument.id })
      .from(providerDocument)
      .where(
        and(
          eq(providerDocument.providerId, row.providerId),
          inArray(providerDocument.status, [ProviderDocumentStatus.Pending]),
        ),
      )
      .limit(1);

    if (stillPending.length === 0) {
      await tx
        .update(provider)
        .set({ reverificationRequestedAt: null })
        .where(eq(provider.id, row.providerId));
    }

    return {
      applied: true,
      providerId: row.providerId,
      clearedReverification: stillPending.length === 0,
    };
  });
}
