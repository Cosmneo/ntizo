import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, ImageIcon, Loader2, Plus, X } from "lucide-react";
import { Button, cn } from "@ntizo/frontend-ui";
import { useImageUpload } from "@/features/provider/viewmodel/use-image-upload";

/**
 * Step 5: the photographs a customer sees.
 *
 * Keys, never URLs. The upload produces a key and it is the *save* that
 * attaches it — the same split `useImageUpload` already documents for the
 * provider's own logo, and what lets somebody who picked the wrong photograph
 * leave without it sticking.
 *
 * The order is the answer to a question nobody asks out loud: the first image
 * is the cover, the one a search card shows. So it is reorderable, and the
 * first one says so.
 *
 * Reordering is arrows rather than dragging. The order matters but changes
 * rarely, and a drag needs a keyboard path built beside it to be usable at
 * all — two interactions to maintain where one is enough.
 */
export function StepImages({
  providerId,
  imageKeys,
  imageUrls,
  onChange,
}: {
  providerId: string;
  /** The stored keys, in display order. The first is the cover. */
  imageKeys: readonly string[];
  /** What the server can currently serve, positionally aligned with the keys it could compose. */
  imageUrls: readonly string[];
  onChange: (next: string[]) => void;
}) {
  const { t } = useTranslation("provider");
  const upload = useImageUpload(providerId);
  const fileInput = useRef<HTMLInputElement>(null);

  /**
   * Previews for images picked in this session, by key.
   *
   * The upload answers with `url: null` wherever no public bucket is
   * configured, and the server's own `imageUrls` only catch up after a save
   * and a refetch. An object URL bridges exactly that gap and no longer:
   * anything already saved is served by the API.
   */
  const [freshPreviews, setFreshPreviews] = useState<Record<string, string>>({});

  /**
   * What to show for a key.
   *
   * The server's list is positional and *shorter* than the keys whenever a URL
   * could not be composed, so it cannot be indexed by the key's position. It
   * is matched by suffix instead — a URL always ends in the key it serves.
   */
  const previewFor = (key: string): string | null =>
    freshPreviews[key] ?? imageUrls.find((u) => u.endsWith(key)) ?? null;

  async function add(files: File[]) {
    if (files.length === 0) return;
    const results = await upload.uploadMany("service", files);
    const added = results.map((r) => r.key);
    setFreshPreviews((current) => {
      const next = { ...current };
      results.forEach((result, i) => {
        const file = files[i];
        if (file) next[result.key] = URL.createObjectURL(file);
      });
      return next;
    });
    onChange([...imageKeys, ...added]);
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= imageKeys.length) return;
    const next = [...imageKeys];
    const [moved] = next.splice(from, 1);
    if (moved !== undefined) next.splice(to, 0, moved);
    onChange(next);
  }

  return (
    <div className="grid gap-4">
      {imageKeys.length === 0 ? (
        <p className="type-body text-[var(--color-muted-foreground)]">
          {t("serviceImagesEmpty")}
        </p>
      ) : (
        <ul className="grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3">
          {imageKeys.map((key, i) => {
            const preview = previewFor(key);
            return (
              <li
                key={key}
                className="relative overflow-hidden rounded-[var(--radius-card-sm)] border border-[var(--color-border)]"
              >
                <div className="grid aspect-[4/3] place-items-center bg-[var(--color-muted)]">
                  {preview ? (
                    <img src={preview} alt="" className="h-full w-full object-cover" />
                  ) : (
                    // Uploaded, but nothing can serve it here. Said plainly
                    // rather than shown as a broken image.
                    <span className="type-caption px-2 text-center text-[var(--color-muted-foreground)]">
                      <ImageIcon className="mx-auto mb-1 h-5 w-5" aria-hidden="true" />
                      {t("serviceImagesUnavailable")}
                    </span>
                  )}
                </div>

                {i === 0 && (
                  <span className="type-caption absolute top-1.5 left-1.5 rounded-full bg-[var(--color-primary)] px-2 py-0.5 font-semibold text-white">
                    {t("serviceImagesCover")}
                  </span>
                )}

                <button
                  type="button"
                  aria-label={t("serviceImagesRemove", { n: i + 1 })}
                  onClick={() => onChange(imageKeys.filter((k) => k !== key))}
                  className="absolute top-1.5 right-1.5 grid h-7 w-7 place-items-center rounded-full bg-[var(--color-background)]/90 hover:bg-[var(--color-background)]"
                >
                  <X className="h-4 w-4" />
                </button>

                <div className="flex items-center justify-between gap-1 p-1.5">
                  <IconButton
                    label={t("serviceImagesMoveEarlier", { n: i + 1 })}
                    disabled={i === 0}
                    onClick={() => move(i, i - 1)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </IconButton>
                  <IconButton
                    label={t("serviceImagesMoveLater", { n: i + 1 })}
                    disabled={i === imageKeys.length - 1}
                    onClick={() => move(i, i + 1)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </IconButton>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {upload.errorKey && (
        <p className="type-caption text-[var(--color-destructive)]">{t(upload.errorKey)}</p>
      )}

      <div>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            // Cleared before the upload, not after: leaving the value set
            // means picking the same file twice in a row fires no change.
            e.target.value = "";
            void add(files);
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={upload.busy}
          onClick={() => fileInput.current?.click()}
        >
          {upload.busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          {upload.busy ? t("serviceImagesUploading") : t("serviceImagesAdd")}
        </Button>
      </div>
    </div>
  );
}

/** A square icon button that keeps its name for anyone who cannot see the icon. */
function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "grid h-7 w-7 place-items-center rounded-[var(--radius-field)]",
        disabled
          ? "text-[var(--color-border)]"
          : "text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]",
      )}
    >
      {children}
    </button>
  );
}
