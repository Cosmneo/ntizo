import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { MapPin, Plus } from "lucide-react";
import type { AddressDTO } from "@ntizo/shared";
import { Button, countryName } from "@ntizo/frontend-ui";
import { AddressForm } from "@/features/account/ui/address-form";
import {
  useAddressMutations,
  useMyAddresses,
} from "@/features/account/viewmodel/use-addresses";
import { EmptyCard } from "@/shared/components/empty-card";
import { textAction } from "@/shared/ui/text-action";

/**
 * One address, on a hairline.
 *
 * A row rather than a card: a disc for the pin (a hairline ring, not a tint),
 * the label with "default" as a word beside it, the address on one line, and
 * the actions as text at the row's end — under it on a phone. It was a
 * bordered card with an outlined button and a red link per address, which is
 * a form's worth of chrome for a line of text.
 */
function AddressRow({
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
    <li className="grid grid-cols-[36px_minmax(0,1fr)] gap-x-3.5 gap-y-3 border-t border-[var(--color-border)] py-4 first:border-t-0 sm:grid-cols-[36px_minmax(0,1fr)_auto] sm:items-start">
      <span
        aria-hidden="true"
        className="grid h-9 w-9 place-items-center rounded-full border border-[var(--color-border)] text-[var(--color-headline)]"
      >
        <MapPin className="h-[17px] w-[17px]" strokeWidth={1.7} />
      </span>

      <div className="min-w-0 pt-px">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="type-body font-semibold">{address.label}</span>
          {address.isDefault && (
            <span className="type-caption text-[var(--color-muted-foreground)]">{t("addrDefault")}</span>
          )}
        </div>
        <p className="type-body mt-0.5 text-[var(--color-muted-foreground)]">{lines.join(" · ")}</p>
        {address.directions && (
          <p className="type-caption mt-1 text-[var(--color-muted-foreground)]">{address.directions}</p>
        )}
      </div>

      {/* Second column on a phone, its own column from `sm`. */}
      <div className="col-start-2 flex flex-wrap items-center gap-x-5 gap-y-1 sm:col-start-3 sm:pt-0.5">
        <button type="button" onClick={onEdit} disabled={busy} className={textAction()}>
          {t("edit")}
        </button>
        {!address.isDefault && (
          <button type="button" onClick={onMakeDefault} disabled={busy} className={textAction()}>
            {t("addrMakeDefault")}
          </button>
        )}
        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          className={textAction({ destructive: true })}
        >
          {t("delete")}
        </button>
      </div>
    </li>
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
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="type-h1 text-[var(--color-headline)]">{t("navAddresses")}</h1>
          <p className="type-body mt-1 text-[var(--color-muted-foreground)]">{t("addressesBlurb")}</p>
        </div>
        {/* The page's one filled button: adding is what the page is for. */}
        {editing === null && (
          <Button onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" />
            {t("addrAdd")}
          </Button>
        )}
      </div>

      {editing !== null && (
        <div className="mb-6">
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
      )}

      {isPending ? null : addresses.length === 0 && editing === null ? (
        <EmptyCard badge={MapPin} title={t("addressesEmptyTitle")} body={t("addressesEmptyBody")} />
      ) : (
        <ul className="grid list-none p-0">
          {addresses.map((address) => (
            <AddressRow
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
                void remove.mutateAsync(address.id).then(() => toast.success(t("addrDeleted")))
              }
            />
          ))}
        </ul>
      )}
    </>
  );
}
