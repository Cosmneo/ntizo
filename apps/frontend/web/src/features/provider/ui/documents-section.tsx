import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  Upload,
  XCircle,
} from "lucide-react";
import { Badge, Button, cn } from "@ntizo/frontend-ui";
import {
  DOCUMENT_MIME_TYPES,
  IDENTITY_DOCUMENT_TYPES,
  MAX_DOCUMENT_BYTES,
  ProviderDocumentStatus,
  ProviderType,
  isAcceptedDocumentMime,
  requiredDocumentsFor,
  type ProviderDocumentType,
} from "@ntizo/shared";
import { useDocumentUpload } from "../viewmodel/use-document-upload";
import type { ProviderDocument } from "../domain/types";

const STATUS_TONE: Record<string, "success" | "warning" | "danger"> = {
  [ProviderDocumentStatus.Accepted]: "success",
  [ProviderDocumentStatus.Pending]: "warning",
  [ProviderDocumentStatus.Rejected]: "danger",
};

const STATUS_ICON: Record<string, typeof Clock> = {
  [ProviderDocumentStatus.Accepted]: CheckCircle2,
  [ProviderDocumentStatus.Pending]: Clock,
  [ProviderDocumentStatus.Rejected]: XCircle,
};

/**
 * Compliance documents, in settings as well as in the wizard.
 *
 * The wizard's documents step is skippable — deliberately, because a
 * photograph of an ID card is the highest friction in the whole flow and
 * someone signing up on a phone in the street does not have their papers to
 * hand. Skippable only works if there is somewhere to finish, and this is it.
 *
 * It also carries what the wizard never can: a rejection. A document refused
 * two weeks after signup has no other screen to appear on, and "rejected, and
 * here is why" is the only version of that news anyone can act on.
 *
 * Replacing an accepted document is allowed and is not silent. The upload
 * arrives `pending` like any other, the accepted row is kept rather than
 * overwritten, and the provider is flagged for re-verification — so a real
 * document cannot earn the badge and then be swapped for a forgery that
 * inherits it. The warning below says so before the file dialog opens, which
 * is the honest place to say it.
 */
export function DocumentsSection({
  providerId,
  providerType,
  documents,
  reverificationRequestedAt,
  onUploaded,
}: {
  providerId: string;
  providerType: ProviderType;
  documents: readonly ProviderDocument[];
  reverificationRequestedAt: string | null;
  onUploaded: () => void;
}) {
  const { t } = useTranslation("provider");
  const { t: to } = useTranslation("onboarding");
  const upload = useDocumentUpload(providerId);

  const held = new Map(documents.map((d) => [d.type, d]));
  const identity = IDENTITY_DOCUMENT_TYPES.map((type) => held.get(type)).find(
    Boolean,
  );

  async function send(type: ProviderDocumentType, file: File) {
    const result = await upload.send(type, file);
    if (result) onUploaded();
  }

  return (
    <div className="grid gap-4">
      {reverificationRequestedAt && (
        <p className="type-body flex items-start gap-2.5 rounded-[var(--radius-card-sm)] border border-[color-mix(in_srgb,var(--color-warning,#b45309)_35%,transparent)] bg-[color-mix(in_srgb,var(--color-warning,#b45309)_8%,transparent)] px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {t("documentsReverification")}
        </p>
      )}

      {identity ? (
        <DocumentRow
          document={identity}
          label={to(`documents.type.${identity.type}.label`)}
          onReplace={(file) =>
            void send(identity.type as ProviderDocumentType, file)
          }
          busy={upload.busy}
        />
      ) : (
        <EmptySlot
          label={to("documents.identity.label")}
          hint={to("documents.identity.hint")}
          choices={IDENTITY_DOCUMENT_TYPES.map((type) => ({
            type,
            label: to(`documents.type.${type}.label`),
          }))}
          onPick={(type, file) => void send(type, file)}
          busy={upload.busy}
        />
      )}

      {requiredDocumentsFor(providerType).map((type) => {
        const document = held.get(type);
        return document ? (
          <DocumentRow
            key={type}
            document={document}
            label={to(`documents.type.${type}.label`)}
            onReplace={(file) => void send(type, file)}
            busy={upload.busy}
          />
        ) : (
          <EmptySlot
            key={type}
            label={to(`documents.type.${type}.label`)}
            hint={to(`documents.type.${type}.hint`)}
            choices={[{ type, label: to(`documents.type.${type}.label`) }]}
            onPick={(t2, file) => void send(t2, file)}
            busy={upload.busy}
          />
        );
      })}

      {upload.errorKey && (
        <p className="type-caption text-[var(--color-destructive)]">
          {t(upload.errorKey)}
        </p>
      )}

      <p className="type-caption text-[var(--color-muted-foreground)]">
        {to("documents.privacy")}
      </p>
    </div>
  );
}

/** One document that exists, with where it stands and what to do about it. */
function DocumentRow({
  document,
  label,
  onReplace,
  busy,
}: {
  document: ProviderDocument;
  label: string;
  onReplace: (file: File) => void;
  busy: boolean;
}) {
  const { t } = useTranslation("provider");
  const [confirming, setConfirming] = useState(false);
  const Icon = STATUS_ICON[document.status] ?? FileText;
  const accepted = document.status === ProviderDocumentStatus.Accepted;

  return (
    <div className="rounded-[var(--radius-card-sm)] border border-[var(--color-border)] p-5">
      <div className="flex flex-wrap items-start gap-3.5">
        <Icon
          className={cn(
            "mt-0.5 h-5 w-5 shrink-0",
            accepted && "text-[var(--color-primary)]",
            document.status === ProviderDocumentStatus.Rejected &&
              "text-[var(--color-destructive)]",
          )}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <p className="type-body-medium font-semibold">{label}</p>
            <Badge tone={STATUS_TONE[document.status] ?? "info"}>
              {t(`documentStatus.${document.status}`)}
            </Badge>
          </div>
          {document.fileName && (
            <p className="type-caption mt-1 truncate text-[var(--color-muted-foreground)]">
              {document.fileName}
            </p>
          )}
          {/* The reason, not just the verdict. "Rejected" alone leaves someone
              re-uploading the same unreadable photograph forever. */}
          {document.rejectionReason && (
            <p className="type-caption mt-1.5 text-[var(--color-destructive)]">
              {document.rejectionReason}
            </p>
          )}
        </div>

        {accepted && !confirming ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => setConfirming(true)}
          >
            {t("documentsReplace")}
          </Button>
        ) : (
          <FilePicker
            id={`doc-${document.type}`}
            label={t("documentsReplace")}
            disabled={busy}
            onPick={onReplace}
          />
        )}
      </div>

      {/* Said before the file dialog opens, not after the upload. Someone
          renewing an expired ID should know their standing changes; someone
          hoping the swap goes unnoticed should know it does not. */}
      {accepted && confirming && (
        <p className="type-caption mt-3 flex items-start gap-2 rounded-[var(--radius-field)] bg-[var(--color-muted)] px-3 py-2.5">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {t("documentsReplaceWarning")}
        </p>
      )}
    </div>
  );
}

function EmptySlot({
  label,
  hint,
  choices,
  onPick,
  busy,
}: {
  label: string;
  hint: string;
  choices: readonly { type: ProviderDocumentType; label: string }[];
  onPick: (type: ProviderDocumentType, file: File) => void;
  busy: boolean;
}) {
  return (
    <div className="rounded-[var(--radius-card-sm)] border border-dashed border-[var(--color-border)] p-5">
      <p className="type-body-medium font-semibold">{label}</p>
      <p className="type-caption mt-1 text-[var(--color-muted-foreground)]">
        {hint}
      </p>
      <div
        className={cn(
          "mt-4 grid gap-2",
          choices.length > 1 && "sm:grid-cols-3",
        )}
      >
        {choices.map((choice) => (
          <FilePicker
            key={choice.type}
            id={`doc-${choice.type}`}
            label={choice.label}
            disabled={busy}
            onPick={(file) => onPick(choice.type, file)}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * The file input, dressed as a button.
 *
 * Same shape as the wizard's, and both duplicate the server's checks. The pair
 * only spares the user an upload that was going to be refused; `accept` is a
 * suggestion to the file dialog and nothing more.
 */
function FilePicker({
  id,
  label,
  disabled,
  onPick,
}: {
  id: string;
  label: string;
  disabled?: boolean;
  onPick: (file: File) => void;
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        "type-body-medium flex cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-field)] border border-dashed border-[var(--color-border)] px-4 py-3 font-semibold transition-colors",
        disabled
          ? "cursor-not-allowed opacity-50"
          : "hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]",
      )}
    >
      <Upload className="h-4 w-4" />
      {label}
      <input
        id={id}
        type="file"
        className="sr-only"
        disabled={disabled}
        accept={DOCUMENT_MIME_TYPES.join(",")}
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Reset first: picking the same file twice in a row fires no change
          // event otherwise, which reads as the second attempt being ignored.
          e.target.value = "";
          if (!file) return;
          if (
            !isAcceptedDocumentMime(file.type) ||
            file.size > MAX_DOCUMENT_BYTES
          )
            return;
          onPick(file);
        }}
      />
    </label>
  );
}
