import { useTranslation } from "react-i18next";
import type { CropStrings } from "@ntizo/frontend-ui";

/**
 * The cropper's copy, from the account bundle.
 *
 * `@ntizo/frontend-ui` has no i18n and must not grow one — a component
 * package that translates decides for every app consuming it. The provider
 * feature has its own version of this hook against its own namespace; they
 * are two lookups of five keys, not a shared abstraction waiting to happen.
 */
export function useAvatarCropStrings(): CropStrings {
  const { t } = useTranslation("account");
  return {
    title: t("crop.title"),
    hint: t("crop.hint"),
    cancel: t("crop.cancel"),
    confirm: t("crop.confirm"),
    zoom: t("crop.zoom"),
  };
}
