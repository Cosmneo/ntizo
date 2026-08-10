import * as React from "react";
import { Loader2, Minus, Plus } from "lucide-react";
import { cn } from "../lib/utils";
import { Button } from "./button";

/**
 * Frame an image to a fixed shape before it is uploaded.
 *
 * The alternative — accept whatever comes and let CSS crop it — puts a 3:4
 * phone photograph into a square tile and takes the middle, which is where the
 * sky is. Rejecting the wrong shape outright is worse still: almost nothing a
 * phone produces is square, so the honest options are "crop it for them badly"
 * or "let them crop it themselves".
 *
 * Also a size cut. A 4 MB phone photograph leaves here at a few hundred KB
 * because the canvas draws it at the output resolution and nothing above that
 * survives — which matters on a mobile connection and keeps uploads well under
 * the 5 MB cap rather than close to it.
 *
 * No dependency. A cropper is a transform, two clamps and one `drawImage`; a
 * library for that would be more code to ship than the feature.
 */

export interface CropTarget {
  /** Width ÷ height of the frame, and of the file that comes out. */
  aspect: number;
  /** Longest edge of the exported image, in pixels. */
  width: number;
}

/** Square: a wordmark and a person's face both survive it. */
export const LOGO_CROP: CropTarget = { aspect: 1, width: 512 };

/** Landscape, the shape a photograph usually already is. */
export const PHOTO_CROP: CropTarget = { aspect: 4 / 3, width: 1600 };

const MAX_ZOOM = 4;

/** WebP where it encodes, JPEG where it does not. Never PNG — these are photos. */
function outputType(): "image/webp" | "image/jpeg" {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  return canvas.toDataURL("image/webp").startsWith("data:image/webp")
    ? "image/webp"
    : "image/jpeg";
}

function renameFor(name: string, type: string): string {
  const stem = name.replace(/\.[^.]+$/, "") || "image";
  return `${stem}.${type === "image/webp" ? "webp" : "jpg"}`;
}

export interface View {
  /** Multiplier on the cover-fit scale. Never below 1, or gutters appear. */
  zoom: number;
  /** Image top-left relative to the frame's top-left, in frame pixels. */
  x: number;
  y: number;
}

/**
 * The frame, expressed in source pixels.
 *
 * Extracted because it is the one place a silent error is invisible: get it
 * wrong and the crop still produces a plausible image, just not the one that
 * was framed. `scale` maps frame pixels to source pixels, and the view offset
 * is the image's top-left relative to the frame — so negating it and dividing
 * gives where the frame's top-left sits in the source.
 */
export function sourceRect(
  frame: { w: number; h: number },
  view: View,
  scale: number,
): { sx: number; sy: number; sw: number; sh: number } {
  return {
    sx: -view.x / scale,
    sy: -view.y / scale,
    sw: frame.w / scale,
    sh: frame.h / scale,
  };
}

/** The smallest scale at which the image still covers the frame. */
export function coverScale(
  natural: { w: number; h: number },
  frame: { w: number; h: number },
): number {
  return Math.max(frame.w / natural.w, frame.h / natural.h);
}

/** Keeps the image covering the frame however it is dragged or zoomed. */
export function clampView(
  view: View,
  frame: { w: number; h: number },
  shown: { w: number; h: number },
): View {
  return {
    zoom: view.zoom,
    x: Math.min(0, Math.max(frame.w - shown.w, view.x)),
    y: Math.min(0, Math.max(frame.h - shown.h, view.y)),
  };
}

export interface ImageCropperProps {
  file: File;
  target: CropTarget;
  title: string;
  hint: string;
  cancelText: string;
  confirmText: string;
  zoomLabel: string;
  onCancel: () => void;
  onConfirm: (file: File) => void;
}

export function ImageCropper({
  file,
  target,
  title,
  hint,
  cancelText,
  confirmText,
  zoomLabel,
  onCancel,
  onConfirm,
}: ImageCropperProps) {
  const frameRef = React.useRef<HTMLDivElement>(null);
  const [image, setImage] = React.useState<HTMLImageElement | null>(null);
  const [frame, setFrame] = React.useState({ w: 0, h: 0 });
  const [view, setView] = React.useState<View>({ zoom: 1, x: 0, y: 0 });
  const [working, setWorking] = React.useState(false);
  const drag = React.useRef<{
    x: number;
    y: number;
    ox: number;
    oy: number;
  } | null>(null);

  // Decoded once. The object URL is revoked as soon as the bitmap exists — the
  // element holds the decoded image, so the blob URL has no further job.
  React.useEffect(() => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setImage(img);
      URL.revokeObjectURL(url);
    };
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  React.useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const measure = () =>
      setFrame({ w: el.clientWidth, h: el.clientWidth / target.aspect });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [target.aspect]);

  /** Smallest scale that still covers the frame. Anything less shows through. */
  const cover =
    image && frame.w
      ? coverScale({ w: image.naturalWidth, h: image.naturalHeight }, frame)
      : 1;
  const scale = cover * view.zoom;
  const shown = image
    ? { w: image.naturalWidth * scale, h: image.naturalHeight * scale }
    : { w: 0, h: 0 };

  /** Keeps the image covering the frame however it is dragged or zoomed. */
  const clamp = React.useCallback(
    (next: View, size: { w: number; h: number }): View => clampView(next, frame, size),
    [frame],
  );

  // Re-centre whenever the image or the frame changes, so it opens showing the
  // middle rather than the top-left corner.
  React.useEffect(() => {
    if (!image || !frame.w) return;
    const c = coverScale({ w: image.naturalWidth, h: image.naturalHeight }, frame);
    setView({
      zoom: 1,
      x: (frame.w - image.naturalWidth * c) / 2,
      y: (frame.h - image.naturalHeight * c) / 2,
    });
  }, [image, frame.w, frame.h]);

  function setZoom(zoom: number) {
    if (!image) return;
    const next = Math.min(MAX_ZOOM, Math.max(1, zoom));
    const nextScale = cover * next;
    const size = {
      w: image.naturalWidth * nextScale,
      h: image.naturalHeight * nextScale,
    };
    // Zoom about the frame's centre, so the thing being looked at stays put
    // instead of sliding away from under the pointer.
    const ratio = nextScale / scale;
    setView((v) =>
      clamp(
        {
          zoom: next,
          x: frame.w / 2 - (frame.w / 2 - v.x) * ratio,
          y: frame.h / 2 - (frame.h / 2 - v.y) * ratio,
        },
        size,
      ),
    );
  }

  async function confirm() {
    if (!image || !frame.w) return;
    setWorking(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = target.width;
      canvas.height = Math.round(target.width / target.aspect);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.imageSmoothingQuality = "high";

      const { sx, sy, sw, sh } = sourceRect(frame, view, scale);
      ctx.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

      const type = outputType();
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, type, 0.85),
      );
      if (!blob) return;
      onConfirm(new File([blob], renameFor(file.name, type), { type }));
    } finally {
      setWorking(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 backdrop-blur-sm"
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
    >
      <div className="w-full max-w-md rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-background)] p-5 shadow-xl">
        <h2 className="type-h3 font-semibold">{title}</h2>
        <p className="type-caption mt-1 text-[var(--color-muted-foreground)]">
          {hint}
        </p>

        <div
          ref={frameRef}
          style={{ aspectRatio: String(target.aspect) }}
          className={cn(
            "relative mt-4 w-full touch-none overflow-hidden rounded-[var(--radius-card-sm)] bg-[var(--color-muted)] select-none",
            image ? "cursor-grab active:cursor-grabbing" : "",
          )}
          onPointerDown={(e) => {
            if (!image) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = {
              x: e.clientX,
              y: e.clientY,
              ox: view.x,
              oy: view.y,
            };
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d) return;
            setView((v) =>
              clamp(
                {
                  ...v,
                  x: d.ox + (e.clientX - d.x),
                  y: d.oy + (e.clientY - d.y),
                },
                shown,
              ),
            );
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          onWheel={(e) => setZoom(view.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1))}
        >
          {image ? (
            <img
              src={image.src}
              alt=""
              draggable={false}
              style={{
                width: shown.w,
                height: shown.h,
                transform: `translate(${view.x}px, ${view.y}px)`,
              }}
              className="max-w-none origin-top-left"
            />
          ) : (
            <span className="absolute inset-0 grid place-items-center">
              <Loader2 className="h-5 w-5 animate-spin text-[var(--color-muted-foreground)]" />
            </span>
          )}
        </div>

        <div className="mt-4 flex items-center gap-3">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-label={`${zoomLabel} −`}
            onClick={() => setZoom(view.zoom - 0.25)}
          >
            <Minus className="h-4 w-4" />
          </Button>
          <input
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={view.zoom}
            aria-label={zoomLabel}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-[var(--color-muted)] accent-[var(--color-primary)]"
          />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-label={`${zoomLabel} +`}
            onClick={() => setZoom(view.zoom + 0.25)}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-5 flex justify-end gap-2.5">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={working}
          >
            {cancelText}
          </Button>
          <Button
            type="button"
            onClick={() => void confirm()}
            disabled={!image || working}
          >
            {working ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {confirmText}
          </Button>
        </div>
      </div>
    </div>
  );
}
