/**
 * `1200` -> "12%", through the locale's own percent formatting rather than a
 * division and a concatenated "%" (which would ignore locale separators —
 * `1234` should read "12,34 %" in `fr-FR`, not "12.34%").
 *
 * Lifted out of `features/admin/providers/domain/types.ts` when a second
 * screen needed the identical rule for the identical field
 * (`commissionBps`): the admin queue reads it to decide on an application,
 * `ProviderShell` reads it so the workspace it belongs to can see its own
 * rate. Two `bps / 10_000`s are two chances for the number a provider is
 * shown to quietly stop matching the number an admin set.
 */
export function formatCommission(bps: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "percent",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(bps / 10_000);
}
