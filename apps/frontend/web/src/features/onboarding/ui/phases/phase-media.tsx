import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, GalleryUpload, LogoUpload } from "@ntizo/frontend-ui";
import { useActiveProvider } from "@/features/provider/viewmodel/use-active-provider";
import { useCropStrings } from "@/features/provider/viewmodel/use-crop-strings";
import { useImageUpload } from "@/features/provider/viewmodel/use-image-upload";
import { useUpdateProvider } from "@/features/provider/viewmodel/use-provider-mutations";
import {
  HeroQuestion,
  StepFooter,
} from "@/features/onboarding/ui/wizard-chrome";

/** Kept below the 24 the settings page allows: a wizard is not the place to fill a gallery. */
const WIZARD_PHOTO_LIMIT = 8;

/**
 * The logo and the first few photographs of work.
 *
 * Sits after the step that creates the provider, and has to: uploads are
 * refused for anyone who is not a member of the provider they are uploading
 * for, so there is no key space to write into until the row exists.
 *
 * Saved as they are chosen rather than on Continue. A wizard has no save
 * button and should not grow one — and the alternative, holding files in
 * memory until the end, loses them entirely to a refresh on the review screen.
 *
 * Skippable, like the documents step and for the same reason: a provider
 * signing up on a phone in the street has no photographs of finished work to
 * hand. Unlike documents, nothing is blocked by leaving it empty — a business
 * page with no images is worse than one with images, not invalid.
 */
export function PhaseMedia({
  onBack,
  onContinue,
}: {
  onBack: () => void;
  onContinue: () => void;
}) {
  const { t } = useTranslation("onboarding");
  const { t: tp } = useTranslation("provider");
  const { activeProvider } = useActiveProvider();
  const media = useImageUpload(activeProvider?.id);
  const logoCrop = useCropStrings("logo");
  const photoCrop = useCropStrings("photo");
  const update = useUpdateProvider(activeProvider?.id ?? "");

  // Keys are the truth on the server; these are what to show while here.
  const [logo, setLogo] = useState<{ key: string; url: string | null } | null>(
    null,
  );
  const [photos, setPhotos] = useState<{ key: string; url: string | null }[]>(
    [],
  );
  const [rejection, setRejection] = useState<string | null>(null);

  const busy = media.busy || update.isPending;

  async function attach(next: {
    logoKey?: string | null;
    photoKeys?: string[];
  }): Promise<void> {
    try {
      await update.mutateAsync(next);
    } catch {
      // Left to the caller's optimistic state rather than reverted. The bytes
      // are in the bucket; a failed attach is recoverable from settings, and
      // yanking a thumbnail out from under someone who just watched it appear
      // reads as data loss.
    }
  }

  return (
    <>
      <HeroQuestion
        title={t("media.title")}
        description={t("media.description")}
      />

      <div className="grid gap-7">
        <LogoUpload
          cropStrings={logoCrop}
          url={logo?.url ?? null}
          onSelect={(file) => {
            setRejection(null);
            void media.upload("logo", file).then((r) => {
              if (!r) return;
              setLogo(r);
              void attach({ logoKey: r.key });
            });
          }}
          onClear={() => {
            setLogo(null);
            void attach({ logoKey: null });
          }}
          onReject={(reason) => setRejection(tp(`mediaReject.${reason}`))}
          busy={busy}
          label={tp("settingsLogo")}
          hint={tp("settingsLogoHint")}
          chooseText={tp("settingsImageChoose")}
          replaceText={tp("settingsImageReplace")}
          removeText={tp("settingsImageRemove")}
        />

        <div className="border-t border-[var(--color-border)] pt-6">
          <p className="type-body-medium font-semibold">
            {tp("settingsPortfolio")}
          </p>
          <p className="type-caption mt-0.5 mb-4 text-[var(--color-muted-foreground)]">
            {t("media.portfolioHint")}
          </p>
          <GalleryUpload
            cropStrings={photoCrop}
            urls={photos
              .map((p) => p.url)
              .filter((u): u is string => u !== null)}
            onSelect={(files) => {
              setRejection(null);
              void media.uploadMany("photo", files).then((results) => {
                if (results.length === 0) return;
                const next = [...photos, ...results];
                setPhotos(next);
                void attach({ photoKeys: next.map((p) => p.key) });
              });
            }}
            onRemoveUrl={(url) => {
              const next = photos.filter((p) => p.url !== url);
              setPhotos(next);
              void attach({ photoKeys: next.map((p) => p.key) });
            }}
            onReject={(reason) => setRejection(tp(`mediaReject.${reason}`))}
            busy={busy}
            max={WIZARD_PHOTO_LIMIT}
            addText={tp("settingsImageAdd")}
            emptyText={t("media.empty")}
            fullText={t("media.full", { max: WIZARD_PHOTO_LIMIT })}
            removeText={tp("settingsImageRemove")}
          />
        </div>

        {(rejection ?? media.errorKey) && (
          <p className="type-caption text-[var(--color-destructive)]">
            {rejection ?? tp(media.errorKey!)}
          </p>
        )}
      </div>

      <p className="type-caption mt-5 text-[var(--color-muted-foreground)]">
        {t("media.later")}
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
            {t("media.skip")}
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
