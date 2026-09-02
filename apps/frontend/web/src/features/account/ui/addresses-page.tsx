import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { MapPin, Plus, Star, Trash2 } from "lucide-react";
import type { AddressDTO } from "@ntizo/shared";
import { Badge, Button, countryName } from "@ntizo/frontend-ui";
import { AddressForm } from "@/features/account/ui/address-form";
import {
  useAddressMutations,
  useMyAddresses,
} from "@/features/account/viewmodel/use-addresses";
import { EmptyCard } from "@/shared/components/empty-card";

function AddressCard({
  address,
  onEdit,
  onDelete,
  onMakeDefault,
  busy,
}: {
  address: AddressDTO;
  onEdit: () => void;
  onDelete: () => void;
  onMakeDefault: () => void;
  busy: boolean;
}) {
  const { t, i18n } = useTranslation("account");
  const lines = [
    address.line1,
    address.line2,
    [address.district, address.city].filter(Boolean).join(", "),
    // Named by the platform, not by a `country.MZ` translation key. The picker
    // offers every country there is, so a key-per-country table would need 245
    // entries in each of the eight languages to stop this line reading "JP".
    countryName(address.country, i18n.resolvedLanguage ?? i18n.language),
  ].filter(Boolean);

  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-background)] p-5">
      <div className="flex flex-wrap items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--radius-card-sm)] bg-[var(--color-muted)]">
          <MapPin className="h-5 w-5 text-[var(--color-primary)]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="type-h3 font-semibold">{address.label}</span>
            {address.isDefault ? (
              <Badge tone="info">{t("addrDefault")}</Badge>
            ) : null}
          </div>
          <p className="type-body mt-1 text-[var(--color-muted-foreground)]">
            {lines.join(" · ")}
          </p>
          {address.directions ? (
            <p className="type-caption mt-1.5 text-[var(--color-muted-foreground)]">
              {address.directions}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={onEdit} disabled={busy}>
          {t("edit")}
        </Button>
        {!address.isDefault ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={onMakeDefault}
            disabled={busy}
          >
            <Star className="h-4 w-4" />
            {t("addrMakeDefault")}
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="sm"
          onClick={onDelete}
          disabled={busy}
          className="ml-auto text-[var(--color-destructive)]"
        >
          <Trash2 className="h-4 w-4" />
          {t("delete")}
        </Button>
      </div>
    </div>
  );
}

export function AddressesPage() {
  const { t } = useTranslation("account");
  const { data: addresses = [], isPending } = useMyAddresses();
  const { add, update, remove } = useAddressMutations();
  const [editing, setEditing] = useState<AddressDTO | "new" | null>(null);

  const busy = add.isPending || update.isPending || remove.isPending;

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="type-h1">{t("navAddresses")}</h1>
          <p className="type-body mt-1 text-[var(--color-muted-foreground)]">
            {t("addressesBlurb")}
          </p>
        </div>
        {editing === null ? (
          <Button onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" />
            {t("addrAdd")}
          </Button>
        ) : null}
      </div>

      {editing !== null ? (
        <div className="mb-4">
          <AddressForm
            ariaLabel={editing === "new" ? t("addrAdd") : t("addrEditTitle")}
            initial={editing === "new" ? undefined : editing}
            submitting={busy}
            onCancel={() => setEditing(null)}
            onSubmit={async (values) => {
              if (editing === "new") await add.mutateAsync(values);
              else await update.mutateAsync({ id: editing.id, input: values });
              toast.success(t("saved"));
              setEditing(null);
            }}
          />
        </div>
      ) : null}

      {isPending ? null : addresses.length === 0 && editing === null ? (
        <EmptyCard
          framed
          badge={MapPin}
          title={t("addressesEmptyTitle")}
          body={t("addressesEmptyBody")}
        />
      ) : (
        <div className="grid gap-4">
          {addresses.map((address) => (
            <AddressCard
              key={address.id}
              address={address}
              busy={busy}
              onEdit={() => setEditing(address)}
              onMakeDefault={() =>
                void update
                  .mutateAsync({ id: address.id, input: { isDefault: true } })
                  .then(() => toast.success(t("saved")))
              }
              onDelete={() =>
                void remove
                  .mutateAsync(address.id)
                  .then(() => toast.success(t("addrDeleted")))
              }
            />
          ))}
        </div>
      )}
    </>
  );
}
