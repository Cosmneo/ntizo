import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Button, Input, Label } from "@ntizo/frontend-ui";
import { usePageHeader } from "@/shared/lib/page-header";
import { providerErrorMessage } from "../domain/errors";
import { useActiveProvider } from "../viewmodel/use-active-provider";
import { useProviderDetail } from "../viewmodel/use-providers";
import {
  useDeactivateProvider,
  useUpdateProvider,
} from "../viewmodel/use-provider-mutations";
import type { ProviderAddress } from "../domain/types";

export function SettingsPage() {
  const { t } = useTranslation("provider");
  const { activeProvider } = useActiveProvider();
  const { data: detail, isLoading } = useProviderDetail(activeProvider?.id);
  const updateMut = useUpdateProvider(activeProvider?.id ?? "");
  const deactivateMut = useDeactivateProvider();
  const nav = useNavigate();

  usePageHeader(t("settings"), activeProvider?.name);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState<ProviderAddress>({});
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (detail) {
      setName(detail.name ?? "");
      setDescription(detail.description ?? "");
      setAddress(detail.address ?? {});
    }
  }, [detail]);

  if (!activeProvider) return null;
  if (isLoading) return <p>…</p>;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    try {
      await updateMut.mutateAsync({ name, description, address });
      setMsg(t("saved"));
    } catch (err) {
      setMsg(providerErrorMessage(t, err));
    }
  }

  async function handleDeactivate() {
    if (!confirm(t("deactivateConfirm"))) return;
    await deactivateMut.mutateAsync(activeProvider!.id);
    nav({ to: "/provider/overview" });
  }

  const inputCls =
    "h-10 rounded-md border border-[var(--color-input)] bg-[var(--color-background)] px-3 text-sm w-full";

  return (
    <div className="max-w-2xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">{t("settings")}</h1>
      </header>

      <form onSubmit={handleSave} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>{t("name")}</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>{t("description")}</Label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={`${inputCls} min-h-20 py-2`}
          />
        </div>

        <fieldset className="border border-[var(--color-border)] rounded-md p-4 flex flex-col gap-3">
          <legend className="text-xs text-[var(--color-muted-foreground)] px-1">
            {t("address")}
          </legend>
          <input
            placeholder={t("line1")}
            value={address.line1 ?? ""}
            onChange={(e) => setAddress({ ...address, line1: e.target.value })}
            className={inputCls}
          />
          <input
            placeholder={t("line2")}
            value={address.line2 ?? ""}
            onChange={(e) => setAddress({ ...address, line2: e.target.value })}
            className={inputCls}
          />
          <div className="flex gap-2">
            <input
              placeholder={t("city")}
              value={address.city ?? ""}
              onChange={(e) => setAddress({ ...address, city: e.target.value })}
              className={inputCls}
            />
            <input
              placeholder={t("region")}
              value={address.region ?? ""}
              onChange={(e) => setAddress({ ...address, region: e.target.value })}
              className={inputCls}
            />
          </div>
          <div className="flex gap-2">
            <input
              placeholder={t("postalCode")}
              value={address.postalCode ?? ""}
              onChange={(e) => setAddress({ ...address, postalCode: e.target.value })}
              className={inputCls}
            />
            <input
              placeholder={t("country")}
              value={address.country ?? ""}
              onChange={(e) => setAddress({ ...address, country: e.target.value })}
              className={inputCls}
            />
          </div>
        </fieldset>

        {msg && <p className="text-sm">{msg}</p>}

        <div>
          <Button type="submit" disabled={updateMut.isPending}>
            {updateMut.isPending ? t("saving") : t("saveChanges")}
          </Button>
        </div>
      </form>

      <hr className="my-8 border-[var(--color-border)]" />

      <section className="rounded-md border border-[var(--color-destructive)]/30 bg-[var(--color-destructive)]/5 p-4">
        <h3 className="text-[var(--color-destructive)] font-semibold mb-1">
          {t("dangerZone")}
        </h3>
        <p className="text-sm text-[var(--color-muted-foreground)] mb-3">
          {t("deactivateDescription")}
        </p>
        <Button variant="destructive" onClick={handleDeactivate}>
          {t("deactivate")}
        </Button>
      </section>
    </div>
  );
}
