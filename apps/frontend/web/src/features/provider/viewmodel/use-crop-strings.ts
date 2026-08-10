import { useTranslation } from "react-i18next";
import type { CropStrings } from "@ntizo/frontend-ui";

/**
 * The cropper's copy, in one place.
 *
 * `@ntizo/frontend-ui` has no i18n and must not grow one — it is a component
 * package, and a package that translates decides for every app that consumes
 * it. So the strings are lifted here, where the app already has a bundle, and
 * handed down as props. This hook exists so the four call sites do not each
 * spell the same five keys.
 *
 * `shape` picks the framing sentence: a logo is squared, a photograph is not.
 */
export function useCropStrings(shape: "logo" | "photo"): CropStrings {
  const { t } = useTranslation("provider");
  return {
    title: t(`crop.${shape}.title`),
    hint: t(`crop.${shape}.hint`),
    cancel: t("crop.cancel"),
    confirm: t("crop.confirm"),
    zoom: t("crop.zoom"),
  };
}
