import * as React from "react";
import { ImagePlus, Loader2, Trash2, Upload } from "lucide-react";
import { cn } from "../lib/utils";
import { Button } from "./button";

/**
 * Image pickers — one square for the logo, a grid for the portfolio.
 *
 * Presentation only. The component never knows a bucket exists: it hands
 * `File`s up and renders whatever URLs come back down. That keeps `ui/` clear
 * of `data/`, and it is also why the same two components serve both the
 * onboarding wizard (uploading before a provider row exists) and settings
 * (uploading against a saved one) — the difference lives entirely in the
 * caller's `onSelect`.
 */

/** Mirrors the server. See `MEDIA_MIME_TYPES` in the API — both must agree. */
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"] as const;
const ACCEPT_ATTR = ACCEPTED.join(",");
const MAX_BYTES = 5 * 1024 * 1024;

export type ImageRejection = "type" | "size";

/**
 * The same two checks the server makes, made early.
 *
 * Not enforcement — `accept` is a hint to the file dialog and this runs in
 * code the caller controls. It exists so someone who picks a 40 MB RAW file
 * learns why in the moment rather than after an upload bar crawls to a 413.
 */
export function rejectImage(file: File): ImageRejection | null {
  if (!(ACCEPTED as readonly string[]).includes(file.type)) return "type";
  if (file.size > MAX_BYTES) return "size";
  return null;
}

/** Object URLs for instant preview, revoked when the list changes or unmounts. */
function usePreviews(files: readonly File[]): string[] {
  const [urls, setUrls] = React.useState<string[]>([]);
  React.useEffect(() => {
    const made = files.map((f) => URL.createObjectURL(f));
    setUrls(made);
    return () => made.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);
  return urls;
}

interface PickerProps {
  /** Fires only with files that passed `rejectImage`. */
  onSelect: (files: File[]) => void;
  onReject?: (reason: ImageRejection, file: File) => void;
  disabled?: boolean;
  multiple?: boolean;
  children: (open: () => void, dragging: boolean) => React.ReactNode;
  className?: string;
}

/**
 * The shared click-or-drop surface.
 *
 * A hidden `<input type="file">` rather than a synthesised one: it is the only
 * thing that opens the OS file dialog from a real user gesture, and it brings
 * keyboard and assistive-tech access for free.
 */
function Picker({
  onSelect,
  onReject,
  disabled,
  multiple,
  children,
  className,
}: PickerProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = React.useState(false);

  function take(list: FileList | null) {
    if (!list) return;
    const accepted: File[] = [];
    for (const file of Array.from(list)) {
      const reason = rejectImage(file);
      if (reason) onReject?.(reason, file);
      else accepted.push(file);
    }
    if (accepted.length) onSelect(multiple ? accepted : accepted.slice(0, 1));
  }

  return (
    <div
      className={className}
      onDragOver={(e) => {
        if (disabled) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        if (disabled) return;
        e.preventDefault();
        setDragging(false);
        take(e.dataTransfer.files);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTR}
        multiple={multiple}
        className="sr-only"
        disabled={disabled}
        onChange={(e) => {
          take(e.target.files);
          // Cleared so picking the same file twice fires `change` again —
          // otherwise a failed upload cannot be retried with the same file.
          e.target.value = "";
        }}
      />
      {children(() => inputRef.current?.click(), dragging)}
    </div>
  );
}

export interface LogoUploadProps {
  /** Already stored. Null renders the empty state. */
  url?: string | null;
  /** Chosen but not yet saved. Shown over `url` so the change is visible. */
  pending?: File | null;
  onSelect: (file: File) => void;
  onClear?: () => void;
  onReject?: (reason: ImageRejection, file: File) => void;
  busy?: boolean;
  disabled?: boolean;
  label: string;
  hint: string;
  chooseText: string;
  replaceText: string;
  removeText: string;
  className?: string;
}

/** The one image that stands in for the business everywhere it is listed. */
export function LogoUpload({
  url,
  pending,
  onSelect,
  onClear,
  onReject,
  busy,
  disabled,
  label,
  hint,
  chooseText,
  replaceText,
  removeText,
  className,
}: LogoUploadProps) {
  const pendingFiles = React.useMemo(() => (pending ? [pending] : []), [pending]);
  const [preview] = usePreviews(pendingFiles);
  const shown = preview ?? url ?? null;

  return (
    <Picker
      onSelect={(files) => files[0] && onSelect(files[0])}
      onReject={onReject}
      disabled={disabled || busy}
      className={className}
    >
      {(open, dragging) => (
        <div className="flex flex-wrap items-center gap-5">
          <button
            type="button"
            onClick={open}
            disabled={disabled || busy}
            aria-label={label}
            className={cn(
              "relative grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-[var(--radius-card-sm)] border-2 border-dashed transition-colors",
              dragging
                ? "border-[var(--color-primary)] bg-[color-mix(in_srgb,var(--color-primary)_8%,transparent)]"
                : "border-[var(--color-border)] hover:border-[var(--color-primary)]",
              shown && "border-solid",
            )}
          >
            {shown ? (
              <img src={shown} alt="" className="h-full w-full object-cover" />
            ) : (
              <ImagePlus className="h-7 w-7 text-[var(--color-muted-foreground)]" />
            )}
            {busy && (
              <span className="absolute inset-0 grid place-items-center bg-[var(--color-background)]/70">
                <Loader2 className="h-5 w-5 animate-spin text-[var(--color-primary)]" />
              </span>
            )}
          </button>

          <div className="min-w-0 flex-1">
            <p className="type-body-medium font-semibold">{label}</p>
            <p className="type-caption mt-0.5 text-[var(--color-muted-foreground)]">
              {hint}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={open}
                disabled={disabled || busy}
              >
                <Upload className="h-4 w-4" />
                {shown ? replaceText : chooseText}
              </Button>
              {shown && onClear && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={onClear}
                  disabled={disabled || busy}
                >
                  {removeText}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </Picker>
  );
}

export interface GalleryUploadProps {
  /** Saved images, in the order they are shown to customers. */
  urls: readonly string[];
  /** Chosen but not yet saved. */
  pending?: readonly File[];
  onSelect: (files: File[]) => void;
  onRemoveUrl: (url: string) => void;
  onRemovePending?: (index: number) => void;
  onReject?: (reason: ImageRejection, file: File) => void;
  busy?: boolean;
  disabled?: boolean;
  max: number;
  addText: string;
  emptyText: string;
  fullText: string;
  removeText: string;
  className?: string;
}

/**
 * The portfolio: photographs of work, at the organisation rather than the
 * service.
 *
 * Both levels exist because they answer different questions. These say "is
 * this provider's work any good?" and a service's own photos say "what am I
 * buying?". Collapsing them into one either misleads on the service page or
 * leaves the provider page empty on the first day — which is exactly when
 * credibility is the thing being decided.
 */
export function GalleryUpload({
  urls,
  pending = [],
  onSelect,
  onRemoveUrl,
  onRemovePending,
  onReject,
  busy,
  disabled,
  max,
  addText,
  emptyText,
  fullText,
  removeText,
  className,
}: GalleryUploadProps) {
  const pendingList = React.useMemo(() => Array.from(pending), [pending]);
  const previews = usePreviews(pendingList);
  const total = urls.length + pendingList.length;
  const full = total >= max;

  return (
    <Picker
      multiple
      onSelect={(files) => onSelect(files.slice(0, Math.max(0, max - total)))}
      onReject={onReject}
      disabled={disabled || busy || full}
      className={className}
    >
      {(open, dragging) => (
        <div>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {urls.map((url) => (
              <Tile
                key={url}
                src={url}
                removeText={removeText}
                onRemove={() => onRemoveUrl(url)}
                disabled={disabled || busy}
              />
            ))}
            {pendingList.map((file, i) => (
              <Tile
                key={`${file.name}-${file.lastModified}-${i}`}
                src={previews[i] ?? ""}
                removeText={removeText}
                onRemove={onRemovePending ? () => onRemovePending(i) : undefined}
                disabled={disabled || busy}
                busy={busy}
              />
            ))}

            {!full && (
              <button
                type="button"
                onClick={open}
                disabled={disabled || busy}
                className={cn(
                  "grid aspect-square place-items-center rounded-[var(--radius-card-sm)] border-2 border-dashed transition-colors",
                  dragging
                    ? "border-[var(--color-primary)] bg-[color-mix(in_srgb,var(--color-primary)_8%,transparent)]"
                    : "border-[var(--color-border)] hover:border-[var(--color-primary)]",
                )}
              >
                <span className="grid place-items-center gap-1 px-2 text-center">
                  <ImagePlus className="h-6 w-6 text-[var(--color-muted-foreground)]" />
                  <span className="type-caption text-[var(--color-muted-foreground)]">
                    {addText}
                  </span>
                </span>
              </button>
            )}
          </div>

          <p className="type-caption mt-3 text-[var(--color-muted-foreground)]">
            {full ? fullText : total === 0 ? emptyText : `${total} / ${max}`}
          </p>
        </div>
      )}
    </Picker>
  );
}

function Tile({
  src,
  onRemove,
  removeText,
  disabled,
  busy,
}: {
  src: string;
  onRemove?: () => void;
  removeText: string;
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <div className="group relative aspect-square overflow-hidden rounded-[var(--radius-card-sm)] border border-[var(--color-border)]">
      <img src={src} alt="" className="h-full w-full object-cover" />
      {busy && (
        <span className="absolute inset-0 grid place-items-center bg-[var(--color-background)]/70">
          <Loader2 className="h-5 w-5 animate-spin text-[var(--color-primary)]" />
        </span>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          aria-label={removeText}
          // Always reachable, not hover-only: on a touch screen there is no
          // hover, and a delete control nobody can reach is not a control.
          className="absolute top-1.5 right-1.5 grid h-7 w-7 place-items-center rounded-full bg-[var(--color-background)]/85 text-[var(--color-destructive)] opacity-100 backdrop-blur transition-opacity hover:bg-[var(--color-background)] sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
