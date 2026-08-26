import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useForm } from "@tanstack/react-form";
import { isValidPhoneNumber } from "libphonenumber-js";
import { toast } from "sonner";
import { GENDERS, type CurrentUserDTO } from "@ntizo/shared";
import {
  Button,
  DatePicker,
  Input,
  Label,
  LogoUpload,
  PhoneInput,
  Select,
} from "@ntizo/frontend-ui";
import { useUpdateMyProfile } from "@/features/account/viewmodel/use-update-profile";
import { useAvatarUpload } from "@/features/account/viewmodel/use-avatar-upload";
import { useAvatarCropStrings } from "@/features/account/viewmodel/use-avatar-crop-strings";

/**
 * Editing happens in place, on the same card that displays the profile.
 *
 * A separate "edit profile" page would mean navigating away from what you are
 * looking at to change it, and then back to check. The fields sit where their
 * values sat.
 */
export function ProfileForm({
  user,
  onDone,
}: {
  user: CurrentUserDTO;
  onDone: () => void;
}) {
  const { t, i18n } = useTranslation("account");
  const update = useUpdateMyProfile();

  const avatar = useAvatarUpload();
  const cropStrings = useAvatarCropStrings();
  // The key chosen in this session, before it is saved. `null` means the
  // photo was removed; `undefined` means it was not touched, and the two must
  // stay distinguishable or "remove" becomes "leave alone".
  const [avatarKey, setAvatarKey] = useState<string | null | undefined>(
    undefined,
  );
  const [freshUrl, setFreshUrl] = useState<string | null>(null);
  const [mediaMessage, setMediaMessage] = useState<string | null>(null);

  // `avatarKey` (the local state) is `undefined` when untouched this session,
  // a string when a new photo was uploaded, `null` when removed. Offer
  // "remove" only when there is a photo of ours to remove — `avatarUrl` is
  // the resolved address of whichever photo wins, so someone who signed up
  // with Google and never uploaded anything still has a non-null
  // `avatarUrl` and must not be shown a "Remove" button that would clear an
  // `avatarKey` that was never set, changing nothing on screen.
  const hasOwnPhoto =
    avatarKey !== undefined ? avatarKey !== null : user.avatarKey !== null;

  // Every IANA zone the browser knows, with the reader's own first so the
  // common case is one click. `Intl.supportedValuesOf("timeZone")` is ~450
  // entries and neither the browser's zone nor its own list changes between
  // renders, so this is computed once rather than rebuilt and re-sorted on
  // every keystroke elsewhere on the form.
  const zones = useMemo(() => {
    const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return [
      browserZone,
      ...Intl.supportedValuesOf("timeZone").filter((z) => z !== browserZone),
    ];
  }, []);

  const form = useForm({
    defaultValues: {
      firstName: user.firstName,
      lastName: user.lastName,
      displayName: user.displayName,
      bio: user.bio ?? "",
      dateOfBirth: user.dateOfBirth ?? "",
      gender: user.gender ?? "",
      phone: user.phoneNumber ?? "",
      timezone: user.timezone,
    },
    validators: {
      onSubmitAsync: async ({ value }) => {
        // Validated here as well as on the server, so the message lands on
        // the field instead of arriving as a mutation failure.
        if (value.phone && !isValidPhoneNumber(value.phone)) {
          return { form: t("invalidPhone") };
        }
        try {
          await update.mutateAsync({
            firstName: value.firstName,
            lastName: value.lastName,
            displayName: value.displayName,
            // Empty means cleared, not "leave alone" — the field was on
            // screen and the user emptied it, which is an instruction.
            bio: value.bio.trim() || null,
            dateOfBirth: value.dateOfBirth || null,
            gender: value.gender
              ? (value.gender as (typeof GENDERS)[number])
              : null,
            // Empty means cleared, not "leave alone" — the field was on
            // screen and the user emptied it, which is an instruction.
            phoneNumber: value.phone.trim() || null,
            timezone: value.timezone,
            // Only when it was touched this session. Sending `undefined`
            // leaves the stored photo alone; sending `null` removes it.
            ...(avatarKey !== undefined ? { avatarKey } : {}),
          });
          toast.success(t("saved"));
          onDone();
          return null;
        } catch (error) {
          return {
            form: error instanceof Error ? error.message : t("saveFailed"),
          };
        }
      },
    },
  });

  return (
    <form
      className="mt-6 grid gap-4 border-t border-[var(--color-border)] pt-5"
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.Subscribe selector={(s) => s.errorMap.onSubmit}>
        {(error) =>
          error ? (
            <p className="type-body-medium text-[var(--color-destructive)]">
              {error.form}
            </p>
          ) : null
        }
      </form.Subscribe>

      <LogoUpload
        shape="round"
        cropStrings={cropStrings}
        url={freshUrl ?? (avatarKey === null ? null : user.avatarUrl)}
        onSelect={(file) => {
          void avatar.upload(file).then((r) => {
            if (!r) return;
            setAvatarKey(r.key);
            setFreshUrl(r.url);
          });
        }}
        // Removing clears the key. What the person sees next is whatever
        // their sign-in provider supplied — for a Google account that is a
        // sensible "reset", and for everyone else it is initials. Offered
        // only when there is a photo of ours to remove — see `hasOwnPhoto`
        // above.
        onClear={
          hasOwnPhoto
            ? () => {
                setAvatarKey(null);
                setFreshUrl(null);
              }
            : undefined
        }
        onReject={(reason) => setMediaMessage(t(`mediaReject.${reason}`))}
        busy={avatar.busy}
        label={t("fieldPhoto")}
        hint={t("fieldPhotoHint")}
        chooseText={t("photoChoose")}
        replaceText={t("photoReplace")}
        removeText={t("photoRemove")}
      />
      {avatar.errorKey || mediaMessage ? (
        <p className="type-body-medium text-[var(--color-destructive)]">
          {mediaMessage ?? t(avatar.errorKey!)}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <form.Field name="firstName">
          {(field) => (
            <div className="grid gap-1.5">
              <Label htmlFor={field.name}>{t("fieldFirstName")}</Label>
              <Input
                id={field.name}
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                required
              />
            </div>
          )}
        </form.Field>

        <form.Field name="lastName">
          {(field) => (
            <div className="grid gap-1.5">
              <Label htmlFor={field.name}>{t("fieldLastName")}</Label>
              <Input
                id={field.name}
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                required
              />
            </div>
          )}
        </form.Field>

        <form.Field name="displayName">
          {(field) => (
            <div className="grid gap-1.5">
              <Label htmlFor={field.name}>{t("fieldDisplayName")}</Label>
              <Input
                id={field.name}
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
              />
            </div>
          )}
        </form.Field>

        <form.Field name="phone">
          {(field) => (
            <div className="grid gap-1.5">
              <Label htmlFor={field.name}>{t("fieldPhone")}</Label>
              {/* The same component the sign-up form uses, so a number that
                  passes here cannot be refused there. It emits E.164 and
                  nothing else. Its copy is passed in because
                  `@ntizo/frontend-ui` has no i18n runtime of its own —
                  `onChange` hands over `(value, { isValid })`, and only the
                  value is wanted here. */}
              <PhoneInput
                id={field.name}
                value={field.state.value}
                onChange={(next) => field.handleChange(next)}
                onBlur={field.handleBlur}
                defaultCountry="MZ"
                locale={i18n.language}
                searchPlaceholder={t("countrySearchPlaceholder")}
                noResultsText={t("countryNoResults")}
                countrySelectLabel={t("countrySelectLabel")}
              />
            </div>
          )}
        </form.Field>

        <form.Field name="timezone">
          {(field) => (
            <div className="grid gap-1.5">
              <Label htmlFor={field.name}>{t("fieldTimezone")}</Label>
              <Select
                id={field.name}
                value={field.state.value}
                onChange={field.handleChange}
                options={zones.map((z) => ({ value: z, label: z }))}
              />
            </div>
          )}
        </form.Field>

        <form.Field name="dateOfBirth">
          {(field) => (
            <div className="grid gap-1.5">
              <Label htmlFor={field.name}>{t("fieldDateOfBirth")}</Label>
              <DatePicker
                id={field.name}
                value={field.state.value}
                onChange={field.handleChange}
                locale={i18n.resolvedLanguage ?? i18n.language}
                // Nobody being born today is filling this in, and a date of
                // birth in the future is not a typo worth accepting.
                max={new Date().toISOString().slice(0, 10)}
                placeholder={t("fieldDateOfBirthPlaceholder")}
                todayLabel={t("datePickerToday")}
                clearLabel={t("datePickerClear")}
                monthLabel={t("datePickerMonth")}
                yearLabel={t("datePickerYear")}
                yearSearchPlaceholder={t("datePickerYearSearch")}
              />
            </div>
          )}
        </form.Field>

        <form.Field name="gender">
          {(field) => (
            <div className="grid gap-1.5">
              <Label htmlFor={field.name}>{t("fieldGender")}</Label>
              <Select
                id={field.name}
                value={field.state.value}
                onChange={field.handleChange}
                placeholder={t("notSet")}
                options={[
                  // Empty is "not answered", distinct from the "undisclosed"
                  // option, which is an answer. Both are offered, because
                  // clearing a field you filled in must be possible.
                  { value: "", label: t("notSet") },
                  ...GENDERS.map((g) => ({
                    value: g,
                    label: t(`gender.${g}`),
                  })),
                ]}
              />
            </div>
          )}
        </form.Field>
      </div>

      <form.Field name="bio">
        {(field) => (
          <div className="grid gap-1.5">
            <Label htmlFor={field.name}>{t("fieldBio")}</Label>
            <textarea
              id={field.name}
              rows={3}
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              className="type-body rounded-[var(--radius-field)] border border-[var(--color-input)] bg-[var(--color-background)] px-3.5 py-2.5 focus-visible:border-[var(--color-primary)] focus-visible:outline-none"
            />
          </div>
        )}
      </form.Field>

      <div className="flex gap-3">
        <form.Subscribe
          selector={(s) => [s.canSubmit, s.isSubmitting] as const}
        >
          {([canSubmit, isSubmitting]) => (
            <Button type="submit" disabled={!canSubmit}>
              {isSubmitting ? t("saving") : t("save")}
            </Button>
          )}
        </form.Subscribe>
        <Button type="button" variant="outline" onClick={onDone}>
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}
