import { useTranslation } from "react-i18next";
import { useForm } from "@tanstack/react-form";
import { toast } from "sonner";
import { GENDERS, type CurrentUserDTO } from "@ntizo/shared";
import { Button, Input, Label } from "@ntizo/frontend-ui";
import { useUpdateMyProfile } from "@/features/account/viewmodel/use-update-profile";

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
  const { t } = useTranslation("account");
  const update = useUpdateMyProfile();

  const form = useForm({
    defaultValues: {
      firstName: user.firstName,
      lastName: user.lastName,
      displayName: user.displayName,
      bio: user.bio ?? "",
      dateOfBirth: user.dateOfBirth ?? "",
      gender: user.gender ?? "",
    },
    validators: {
      onSubmitAsync: async ({ value }) => {
        try {
          await update.mutateAsync({
            firstName: value.firstName,
            lastName: value.lastName,
            displayName: value.displayName,
            // Empty means cleared, not "leave alone" — the field was on
            // screen and the user emptied it, which is an instruction.
            bio: value.bio.trim() || null,
            dateOfBirth: value.dateOfBirth || null,
            gender: value.gender ? (value.gender as (typeof GENDERS)[number]) : null,
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
            <p className="type-body-medium text-[var(--color-destructive)]">{error.form}</p>
          ) : null
        }
      </form.Subscribe>

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

        <form.Field name="dateOfBirth">
          {(field) => (
            <div className="grid gap-1.5">
              <Label htmlFor={field.name}>{t("fieldDateOfBirth")}</Label>
              <Input
                id={field.name}
                type="date"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
              />
            </div>
          )}
        </form.Field>

        <form.Field name="gender">
          {(field) => (
            <div className="grid gap-1.5">
              <Label htmlFor={field.name}>{t("fieldGender")}</Label>
              <select
                id={field.name}
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                className="type-body h-11 rounded-[var(--radius-field)] border border-[var(--color-input)] bg-[var(--color-background)] px-3 focus-visible:border-[var(--color-primary)] focus-visible:outline-none"
              >
                {/* Empty is "not answered", distinct from the "undisclosed"
                    option below it, which is an answer. */}
                <option value="">{t("notSet")}</option>
                {GENDERS.map((g) => (
                  <option key={g} value={g}>
                    {t(`gender.${g}`)}
                  </option>
                ))}
              </select>
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
        <form.Subscribe selector={(s) => [s.canSubmit, s.isSubmitting] as const}>
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
