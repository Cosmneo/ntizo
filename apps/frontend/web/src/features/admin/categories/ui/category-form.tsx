import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ImagePlus, Loader2, Trash2, X } from "lucide-react";
import {
  Button,
  Input,
  Checkbox,
  Sheet,
  SheetContent,
} from "@ntizo/frontend-ui";
import { uploadCategoryImage } from "../data/admin-category.repository";
import { useSaveCategory } from "../viewmodel/use-admin-categories";
import {
  canSave,
  DEFAULT_LOCALE,
  emptyForm,
  formFrom,
  LOCALES,
  type AdminCategory,
} from "../domain/types";

/**
 * Creating and editing a category, in the same right-hand sheet the zone's
 * filters use.
 *
 * A box per language, with the platform's own first and marked required —
 * that is the whole multi-language decision made visible. The other seven are
 * plainly optional: leaving them empty is normal, and a category with only
 * Portuguese is still browsable in Dutch because the server falls back.
 *
 * One image for every language, which is the answer to "different images per
 * language?": a photograph of a kitchen means the same thing in all eight.
 */
export function CategoryFormSheet({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Null creates. */
  editing: AdminCategory | null;
}) {
  const { t } = useTranslation("admin");
  const save = useSaveCategory();
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  // Kept until unmount rather than revoked on load: the rendered <img> is a
  // different element pointing at the same URL, and revoking early leaves it
  // blank.
  const objectUrl = useRef<string | null>(null);

  // Reset every time the sheet opens, so yesterday's half-typed category does
  // not appear inside today's.
  useEffect(() => {
    if (!open) return;
    setForm(editing ? formFrom(editing) : emptyForm());
    setError(null);
  }, [open, editing]);

  useEffect(
    () => () => {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    },
    [],
  );

  const ready = canSave(form.names) && !save.isPending && !uploading;

  async function pickImage(file: File) {
    setUploading(true);
    setError(null);
    try {
      // The id is only a folder. Creating uses a placeholder, so a brand-new
      // category can carry an image without being saved first.
      const { key, url } = await uploadCategoryImage(editing?.id ?? "new", file);
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = URL.createObjectURL(file);
      // The server returns a null URL where nothing serves the bucket, which
      // is the case locally — the local preview stands in so the person can
      // still see what they picked.
      setForm((f) => ({ ...f, imageKey: key, imageUrl: url ?? objectUrl.current }));
    } catch (e) {
      setError(t(`categoryUploadError.${(e as Error).message}`, { defaultValue: t("categoryUploadFailed") }));
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    setError(null);
    try {
      await save.mutateAsync({
        ...(editing ? { categoryId: editing.id } : {}),
        ...(editing || form.code.trim() ? { code: form.code.trim() } : {}),
        icon: form.icon.trim() || null,
        imageKey: form.imageKey,
        sortOrder: form.sortOrder,
        isActive: form.isActive,
        // Every language, including the blank ones. The server drops them, and
        // sending them is what makes clearing a translation expressible — a
        // filtered list could only ever add.
        translations: LOCALES.map((l) => ({ locale: l, name: form.names[l] })),
      });
      onOpenChange(false);
    } catch (e) {
      // The server's code, not its English sentence: the message belongs in
      // the reader's language and the code is the contract that gets it there.
      const code = (e as { code?: string }).code ?? (e as Error).message;
      setError(t(`categoryError.${code}`, { defaultValue: t("categorySaveFailed") }));
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full max-w-lg flex-col">
        <div className="flex items-start justify-between border-b border-[var(--color-border)] px-5 py-4">
          <h2 className="type-h3 font-semibold">
            {editing ? t("categoryEdit") : t("categoryNew")}
          </h2>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label={t("close")}
            className="grid h-8 w-8 place-items-center rounded-full text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid flex-1 content-start gap-6 overflow-y-auto p-5">
          {error && (
            <p className="type-body text-[var(--color-destructive)]">{error}</p>
          )}

          {/* ── The image ─────────────────────────────────────────────────── */}
          <Field label={t("categoryImage")} hint={t("categoryImageHint")}>
            <div className="flex items-center gap-4">
              <div className="grid h-20 w-28 shrink-0 place-items-center overflow-hidden rounded-[var(--radius-card-sm)] border border-[var(--color-border)] bg-[var(--color-muted)]">
                {form.imageUrl ? (
                  <img
                    src={form.imageUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <ImagePlus className="h-5 w-5 text-[var(--color-muted-foreground)]" />
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void pickImage(file);
                    e.target.value = "";
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={uploading}
                  onClick={() => fileInput.current?.click()}
                >
                  {uploading && <Loader2 className="h-4 w-4 animate-spin" />}
                  {form.imageUrl ? t("categoryImageReplace") : t("categoryImageAdd")}
                </Button>
                {form.imageKey && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() =>
                      setForm((f) => ({ ...f, imageKey: null, imageUrl: null }))
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                    {t("categoryImageRemove")}
                  </Button>
                )}
              </div>
            </div>
          </Field>

          {/* ── The names ─────────────────────────────────────────────────── */}
          <div className="grid gap-3">
            <p className="type-caption font-bold tracking-[0.14em] text-[var(--color-muted-foreground)] uppercase">
              {t("categoryNames")}
            </p>
            <p className="type-body text-[var(--color-muted-foreground)]">
              {t("categoryNamesHint")}
            </p>
            {LOCALES.map((locale) => (
              <div key={locale} className="grid gap-1.5">
                <label
                  htmlFor={`name-${locale}`}
                  className="type-caption flex items-center gap-2 text-[var(--color-muted-foreground)]"
                >
                  {t(`locales.${locale}`, { defaultValue: locale })}
                  {locale === DEFAULT_LOCALE && (
                    <span className="rounded-full bg-[var(--color-muted)] px-2 py-0.5 text-[10px] font-semibold">
                      {t("categoryRequired")}
                    </span>
                  )}
                </label>
                <Input
                  id={`name-${locale}`}
                  value={form.names[locale]}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      names: { ...f.names, [locale]: e.target.value },
                    }))
                  }
                  placeholder={
                    locale === DEFAULT_LOCALE
                      ? t("categoryNamePlaceholder")
                      : form.names[DEFAULT_LOCALE] || ""
                  }
                />
              </div>
            ))}
          </div>

          {/* ── The rest ──────────────────────────────────────────────────── */}
          <Field label={t("categoryCode")} hint={t("categoryCodeHint")}>
            <Input
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              placeholder={editing ? "" : t("categoryCodeAuto")}
            />
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={t("categoryIcon")} hint={t("categoryIconHint")}>
              <Input
                value={form.icon}
                onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
                placeholder="wrench"
              />
            </Field>
            <Field label={t("categoryOrder")} hint={t("categoryOrderHint")}>
              <Input
                type="number"
                min={0}
                value={String(form.sortOrder)}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    sortOrder: Number(e.target.value) || 0,
                  }))
                }
              />
            </Field>
          </div>

          <label className="flex items-start gap-3">
            <Checkbox
              className="mt-1"
              checked={form.isActive}
              onChange={(e) =>
                setForm((f) => ({ ...f, isActive: e.target.checked }))
              }
            />
            <span className="grid gap-0.5">
              <span className="type-body-medium font-semibold">
                {t("categoryActive")}
              </span>
              <span className="type-caption text-[var(--color-muted-foreground)]">
                {t("categoryActiveHint")}
              </span>
            </span>
          </label>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-[var(--color-border)] px-5 py-4">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t("close")}
          </Button>
          <Button type="button" disabled={!ready} onClick={() => void submit()}>
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("categorySave")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <span className="type-caption font-bold tracking-[0.14em] text-[var(--color-muted-foreground)] uppercase">
        {label}
      </span>
      {children}
      {hint && (
        <span className="type-caption text-[var(--color-muted-foreground)]">
          {hint}
        </span>
      )}
    </div>
  );
}
