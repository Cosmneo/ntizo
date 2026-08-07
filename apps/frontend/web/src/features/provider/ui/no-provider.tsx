import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Button } from "@ntizo/frontend-ui";
import { usePageHeader } from "@/shared/lib/page-header";
import { providerErrorMessage } from "../domain/errors";
import { useRegisterMe } from "../viewmodel/use-provider-mutations";
import { useActiveProvider } from "../viewmodel/use-active-provider";
import { CreateProviderDialog } from "./create-provider-dialog";

export function NoProviderPage() {
  const { t } = useTranslation("provider");
  const nav = useNavigate();
  const registerMut = useRegisterMe();
  const { setActive, refresh } = useActiveProvider();
  const [dialogOpen, setDialogOpen] = useState(false);

  usePageHeader(t("welcomeTitle"), t("welcomeSubtitle"));

  async function handleAuto() {
    try {
      const { providerId } = await registerMut.mutateAsync({});
      await refresh();
      if (providerId) setActive(providerId);
      nav({ to: "/provider/overview" });
    } catch {
      /* error state via mutation */
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold mb-2">{t("welcomeTitle")}</h1>
      <p className="text-[var(--color-muted-foreground)] mb-6">{t("welcomeSubtitle")}</p>

      <div className="flex gap-3">
        <Button onClick={handleAuto} disabled={registerMut.isPending}>
          {registerMut.isPending ? t("settingUp") : t("setMeUpAutomatically")}
        </Button>
        <Button variant="outline" onClick={() => setDialogOpen(true)}>
          {t("createManually")}
        </Button>
      </div>

      {registerMut.error && (
        <p className="text-sm text-[var(--color-destructive)] mt-4">
          {providerErrorMessage(t, registerMut.error)}
        </p>
      )}

      <CreateProviderDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={(id) => {
          setActive(id);
          nav({ to: "/provider/overview" });
        }}
      />
    </div>
  );
}
