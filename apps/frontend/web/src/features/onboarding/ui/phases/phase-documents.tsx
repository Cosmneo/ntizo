import { useTranslation } from "react-i18next";
import { FileText, Upload, X } from "lucide-react";
import { Button, cn } from "@ntizo/frontend-ui";
import {
  DOCUMENT_MIME_TYPES,
  IDENTITY_DOCUMENT_TYPES,
  MAX_DOCUMENT_BYTES,
  ProviderDocumentType,
  ProviderType,
  isAcceptedDocumentMime,
  requiredDocumentsFor,
} from "@ntizo/shared";
import type {
  DocumentUpload,
  ProviderDraft,
} from "@/features/onboarding/domain/draft";
import {
  HeroQuestion,
  StepFooter,
} from "@/features/onboarding/ui/wizard-chrome";

/**
 * The documents that make the verified badge mean something.
 *
 * Identity is a choice of three, not three requirements: a resident foreigner
 * holds a DIRE and not a national ID, and a screen that says "send your BI" to
 * that person is a screen that says they cannot join. The rest come from the
 * shared enum, which knows an establishment must also prove the business exists
 * and a person need not.
 *
 * Skippable, with a real button. A photograph of an ID card is the highest
 * friction the whole flow has, and someone signing up on a phone in the street
 * does not have their documents to hand — the application can be finished and
 * the dashboard asks again. What it must not do is pretend the application is
 * complete: the copy says plainly that verification cannot start without them.
 */
export function PhaseDocuments({
  draft,
  uploads,
  onUpload,
  onRemove,
  busy,
  errorKey,
  onBack,
  onContinue,
}: {
  draft: ProviderDraft;
  uploads: readonly DocumentUpload[];
  onUpload: (type: ProviderDocumentType, file: File) => void;
  onRemove: (type: ProviderDocumentType) => void;
  busy?: boolean;
  errorKey?: string | null;
  onBack: () => void;
  onContinue: () => void;
}) {
  const { t } = useTranslation("onboarding");
  const { t: tp } = useTranslation("provider");
  const type = (draft.type || ProviderType.Individual) as ProviderType;

  const held = new Set(uploads.map((u) => u.type));
  const identityHeld = IDENTITY_DOCUMENT_TYPES.find((doc) => held.has(doc));

  return (
    <>
      <HeroQuestion
        title={t("documents.title")}
        description={t("documents.description")}
      />

      <div className="grid gap-4">
        <IdentitySlot
          held={identityHeld}
          upload={uploads.find((u) => u.type === identityHeld)}
          onUpload={onUpload}
          onRemove={onRemove}
        />

        {requiredDocumentsFor(type).map((doc) => (
          <DocumentSlot
            key={doc}
            type={doc}
            label={t(`documents.type.${doc}.label`)}
            hint={t(`documents.type.${doc}.hint`)}
            upload={uploads.find((u) => u.type === doc)}
            onUpload={onUpload}
            onRemove={onRemove}
          />
        ))}
      </div>

      {errorKey && (
        <p className="type-caption mt-4 text-[var(--color-destructive)]">
          {tp(errorKey)}
        </p>
      )}

      <p className="type-caption mt-5 text-[var(--color-muted-foreground)]">
        {t("documents.privacy")}
      </p>

      <StepFooter
        onBack={onBack}
        backLabel={t("back")}
        secondary={
          <Button
            type="button"
            variant="outline"
            onClick={onContinue}
            disabled={busy}
          >
            {t("documents.skip")}
          </Button>
        }
      >
        <Button onClick={onContinue} disabled={busy}>
          {t("continue")}
        </Button>
      </StepFooter>
    </>
  );
}

/**
 * The identity slot: one of three, chosen by whichever the person uploads.
 *
 * A single slot with a type picker rather than three slots, because three
 * would read as three things to send.
 */
function IdentitySlot({
  held,
  upload,
  onUpload,
  onRemove,
}: {
  held: ProviderDocumentType | undefined;
  upload: DocumentUpload | undefined;
  onUpload: (type: ProviderDocumentType, file: File) => void;
  onRemove: (type: ProviderDocumentType) => void;
}) {
  const { t } = useTranslation("onboarding");

  if (upload && held) {
    return (
      <UploadedRow
        label={t(`documents.type.${held}.label`)}
        upload={upload}
        onRemove={() => onRemove(held)}
      />
    );
  }

  return (
    <div className="rounded-[var(--radius-card-sm)] border border-[var(--color-border)] p-5">
      <p className="type-body-medium font-semibold">
        {t("documents.identity.label")}
      </p>
      <p className="type-caption mt-1 text-[var(--color-muted-foreground)]">
        {t("documents.identity.hint")}
      </p>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {IDENTITY_DOCUMENT_TYPES.map((doc) => (
          <FilePicker
            key={doc}
            id={`doc-${doc}`}
            label={t(`documents.type.${doc}.label`)}
            onPick={(file) => onUpload(doc, file)}
          />
        ))}
      </div>
    </div>
  );
}

function DocumentSlot({
  type,
  label,
  hint,
  upload,
  onUpload,
  onRemove,
}: {
  type: ProviderDocumentType;
  label: string;
  hint: string;
  upload: DocumentUpload | undefined;
  onUpload: (type: ProviderDocumentType, file: File) => void;
  onRemove: (type: ProviderDocumentType) => void;
}) {
  if (upload) {
    return (
      <UploadedRow
        label={label}
        upload={upload}
        onRemove={() => onRemove(type)}
      />
    );
  }

  return (
    <div className="rounded-[var(--radius-card-sm)] border border-[var(--color-border)] p-5">
      <p className="type-body-medium font-semibold">{label}</p>
      <p className="type-caption mt-1 text-[var(--color-muted-foreground)]">
        {hint}
      </p>
      <div className="mt-4">
        <FilePicker
          id={`doc-${type}`}
          label={label}
          onPick={(file) => onUpload(type, file)}
        />
      </div>
    </div>
  );
}

function UploadedRow({
  label,
  upload,
  onRemove,
}: {
  label: string;
  upload: DocumentUpload;
  onRemove: () => void;
}) {
  const { t } = useTranslation("onboarding");
  return (
    <div className="flex items-center gap-3.5 rounded-[var(--radius-card-sm)] border border-[var(--color-primary)] bg-[color-mix(in_srgb,var(--color-primary)_5%,transparent)] p-5">
      <FileText className="h-5 w-5 shrink-0 text-[var(--color-primary)]" />
      <div className="min-w-0 flex-1">
        <p className="type-body-medium font-semibold">{label}</p>
        <p className="type-caption truncate text-[var(--color-muted-foreground)]">
          {upload.fileName}
        </p>
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label={t("documents.remove")}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

/**
 * The file input, dressed as a button.
 *
 * `accept` and the size check are both here and both duplicated server-side.
 * This pair only spares the user an upload that was going to be refused; it is
 * not the enforcement, because an `accept` attribute is a suggestion to the
 * file dialog and nothing more.
 */
function FilePicker({
  id,
  label,
  onPick,
}: {
  id: string;
  label: string;
  onPick: (file: File) => void;
}) {
  const { t } = useTranslation("onboarding");

  return (
    <label
      htmlFor={id}
      className={cn(
        "type-body-medium flex cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-field)] border border-dashed border-[var(--color-border)] px-4 py-3 font-semibold transition-colors",
        "hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]",
      )}
    >
      <Upload className="h-4 w-4" />
      {label}
      <input
        id={id}
        type="file"
        className="sr-only"
        accept={DOCUMENT_MIME_TYPES.join(",")}
        aria-label={`${t("documents.upload")} — ${label}`}
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
