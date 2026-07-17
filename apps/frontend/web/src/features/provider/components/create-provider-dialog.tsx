import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useForm } from "@tanstack/react-form";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Separator,
} from "@ntizo/frontend-ui";
import { slugify } from "../lib/slugify";
import {
  useCreateProvider,
  useRegisterMe,
} from "../hooks/use-provider-mutations";
import type { ProviderType } from "../types";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: (providerId: string) => void;
}

export function CreateProviderDialog({ open, onOpenChange, onCreated }: Props) {
  const { t } = useTranslation("provider");
  const createMut = useCreateProvider();
  const registerMut = useRegisterMe();
  const [type, setType] = useState<ProviderType>("organization");
  const [slugTouched, setSlugTouched] = useState(false);

  const form = useForm({
    defaultValues: { name: "", slug: "" },
    validators: {
      onSubmitAsync: async ({ value }) => {
        try {
          const res = await createMut.mutateAsync({
            type,
            name: value.name,
            slug: value.slug || slugify(value.name),
          });
          const id =
            (res as { providerId?: string }).providerId ??
            (res as { id?: string }).id;
          if (id) onCreated?.(id);
          onOpenChange(false);
          return null;
        } catch (e) {
          return { form: e instanceof Error ? e.message : "Failed to create" };
        }
      },
    },
  });

  useEffect(() => {
    if (!open) {
      form.reset();
      setSlugTouched(false);
      setType("organization");
    }
  }, [open, form]);

  async function handleRegisterMe() {
    try {
      const { providerId } = await registerMut.mutateAsync({});
      if (providerId) onCreated?.(providerId);
      onOpenChange(false);
    } catch {
      // error shown via mutation state
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("createProvider")}</DialogTitle>
          <DialogDescription>{t("welcomeSubtitle")}</DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
        >
          <form.Field name="name">
            {(field) => (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={field.name}>{t("name")}</Label>
                <Input
                  id={field.name}
                  required
                  value={field.state.value}
                  onChange={(e) => {
                    field.handleChange(e.target.value);
                    if (!slugTouched) form.setFieldValue("slug", slugify(e.target.value));
                  }}
                />
              </div>
            )}
          </form.Field>

          <form.Field name="slug">
            {(field) => (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={field.name}>{t("slug")}</Label>
                <Input
                  id={field.name}
                  value={field.state.value}
                  onChange={(e) => {
                    setSlugTouched(true);
                    field.handleChange(e.target.value);
                  }}
                />
              </div>
            )}
          </form.Field>

          <div className="flex flex-col gap-1.5">
            <Label>{t("type")}</Label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as ProviderType)}
              className="h-10 rounded-md border border-[var(--color-input)] bg-[var(--color-background)] px-3 text-sm"
            >
              <option value="organization">{t("organization")}</option>
              <option value="individual">{t("individual")}</option>
            </select>
          </div>

          <form.Subscribe selector={(s) => s.errorMap.onSubmit}>
            {(err) =>
              err ? (
                <div className="text-sm text-[var(--color-destructive)]">
                  {String(err)}
                </div>
              ) : null
            }
          </form.Subscribe>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("cancel", { ns: "common", defaultValue: "Cancel" })}
            </Button>
            <form.Subscribe selector={(s) => [s.canSubmit, s.isSubmitting] as const}>
              {([canSubmit, isSubmitting]) => (
                <Button type="submit" disabled={!canSubmit}>
                  {isSubmitting ? t("creating") : t("create")}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>

        <Separator className="my-4" />

        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={handleRegisterMe}
          disabled={registerMut.isPending}
        >
          {registerMut.isPending ? t("settingUp") : t("registerMe")}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
