import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, ExternalLink, FileText, Loader2 } from "lucide-react";
import { Badge, Button, Input } from "@ntizo/frontend-ui";
import { ProviderDocumentStatus } from "@ntizo/shared";
import { documentUrl } from "../data/admin-provider.repository";
import { useReviewDocument } from "../viewmodel/use-admin-providers";
import type { AdminProviderDocument } from "../domain/types";

const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "info"> = {
  [ProviderDocumentStatus.Accepted]: "success",
  [ProviderDocumentStatus.Pending]: "warning",
  [ProviderDocumentStatus.Rejected]: "danger",
  [ProviderDocumentStatus.Superseded]: "info",
};

/**
 * The papers the provider sent, and the decision about each.
 *
 * Superseded rows stay in the list. The reason the table is append-only is
 * that an approved identity document could otherwise be swapped for a forged
 * one afterwards, and a reviewer who cannot see that a document was replaced
 * has no way to notice that it happened. They are visibly retired rather than
 * hidden.
 */
export function DocumentsSection({
  providerId,
  documents,
  reverificationRequestedAt,
  loading,
}: {
  providerId: string;
  documents: readonly AdminProviderDocument[];
  reverificationRequestedAt: string | null;
  loading: boolean;
}) {
  const { t, i18n } = useTranslation("admin");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const review = useReviewDocument(providerId);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const when = (iso: string) =>
    new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));

  return (
    <section className="rounded-[var(--radius-card)] border border-[var(--color-border)]">
      <div className="px-5 py-4">
        <p className="type-caption font-bold tracking-[0.14em] text-[var(--color-muted-foreground)] uppercase">
          {t("providerDetailDocuments")}
        </p>
        <p className="type-body mt-0.5 text-[var(--color-muted-foreground)]">
          {t("providerDetailDocumentsHint")}
        </p>
      </div>

      {/* The single most important thing on this screen when it is set: an
          approved document was replaced after the fact. */}
      {reverificationRequestedAt && (
        <div className="mx-5 mb-4 flex items-start gap-3 rounded-[var(--radius-card-sm)] border border-[var(--color-warning)] bg-[color-mix(in_srgb,var(--color-warning)_10%,transparent)] p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-warning)]" />
          <p className="type-body">
            {t("providerDetailReverification", {
              when: when(reverificationRequestedAt),
            })}
          </p>
        </div>
      )}

      {loading ? (
        <p className="type-body border-t border-[var(--color-border)] px-5 py-8 text-center text-[var(--color-muted-foreground)]">
          {t("providerDetailDocumentsLoading")}
        </p>
      ) : documents.length === 0 ? (
        <p className="type-body border-t border-[var(--color-border)] px-5 py-8 text-center text-[var(--color-muted-foreground)]">
          {t("providerDetailNoDocuments")}
        </p>
      ) : (
        <ul className="grid list-none gap-0 p-0">
          {documents.map((doc) => {
            const superseded = doc.status === ProviderDocumentStatus.Superseded;
            const decidable = doc.status === ProviderDocumentStatus.Pending;
            return (
              <li
                key={doc.id}
                className={
                  superseded
                    ? "border-t border-[var(--color-border)] px-5 py-4 opacity-60"
                    : "border-t border-[var(--color-border)] px-5 py-4"
                }
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <FileText className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-muted-foreground)]" />
                    <div className="min-w-0">
                      <p className="type-body-medium font-semibold">
                        {t(`documentType.${doc.type}`, { defaultValue: doc.type })}
                      </p>
                      <p className="type-caption truncate text-[var(--color-muted-foreground)]">
                        {doc.fileName || "—"} · {when(doc.uploadedAt)}
                      </p>
                      {doc.rejectionReason && (
                        <p className="type-caption mt-1 text-[var(--color-destructive)]">
                          {doc.rejectionReason}
                        </p>
                      )}
                      {doc.supersedesId && (
                        // Named on the row that did the replacing, not only on
                        // the one replaced: the reviewer is looking at the new
                        // document and that is where the fact belongs.
                        <p className="type-caption mt-1 text-[var(--color-warning)]">
                          {t("providerDetailReplacesEarlier")}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <Badge tone={STATUS_TONE[doc.status] ?? "info"}>
                      {t(`documentStatus.${doc.status}`, { defaultValue: doc.status })}
                    </Badge>
                    {/* A new tab, not an inline preview: these are PDFs as
                        often as images, and the browser's own viewer handles
                        both better than anything built here would. */}
                    <a
                      href={documentUrl(doc.id)}
                      target="_blank"
                      rel="noreferrer"
                      className="type-body inline-flex items-center gap-1.5 rounded-[var(--radius-field)] border border-[var(--color-border)] px-3 py-2 hover:bg-[var(--color-muted)]"
                    >
                      <ExternalLink className="h-4 w-4" />
                      {t("providerDetailOpenDocument")}
                    </a>
                  </div>
                </div>

                {decidable && (
                  <div className="mt-3 flex flex-wrap items-center gap-2.5">
                    <Button
                      type="button"
                      disabled={review.isPending}
                      onClick={() =>
                        review.mutate({ documentId: doc.id, accept: true })
                      }
                    >
                      {review.isPending &&
                        review.variables?.documentId === doc.id && (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        )}
                      {t("providerDetailAcceptDocument")}
                    </Button>

                    {rejecting === doc.id ? (
                      <>
                        <Input
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          placeholder={t("providerDetailRejectReason")}
                          aria-label={t("providerDetailRejectReason")}
                          className="min-w-[220px] flex-1"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          // A refusal with no reason is one the provider
                          // cannot act on: they are told to send it again with
                          // no idea what was wrong. The server refuses it too.
                          disabled={!reason.trim() || review.isPending}
                          onClick={() => {
                            review.mutate({
                              documentId: doc.id,
                              accept: false,
                              rejectionReason: reason.trim(),
                            });
                            setRejecting(null);
                            setReason("");
                          }}
                        >
                          {t("providerDetailConfirmReject")}
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setRejecting(doc.id);
                          setReason("");
                        }}
                      >
                        {t("providerDetailRejectDocument")}
                      </Button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {review.error && (
        <p className="type-body border-t border-[var(--color-border)] px-5 py-3 text-[var(--color-destructive)]">
          {t(`documentReviewError.${(review.error as Error).message}`, {
            defaultValue: t("providerActionFailed"),
          })}
        </p>
      )}
    </section>
  );
}
