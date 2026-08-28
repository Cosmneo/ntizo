import { Check } from "lucide-react";

/**
 * The green-check bullets at the bottom of the rail: what a reader can rely
 * on before they book.
 *
 * `TrustList` states nothing on its own — it has no idea whether this
 * provider is verified, keeps messages on-platform, or bundles the fee into
 * the price. It only lays out whatever claims the caller hands it. That is
 * deliberate: the verification sentence is true only when an administrator
 * has actually accepted this provider's documents, so it must be conditional
 * on `verified` at the call site, not baked in here as a constant string. The
 * rule this component exists to protect is "nothing goes in this list
 * without a fact behind it" — if the next feature wants a cheerful bullet,
 * it needs a real check to hang it on, not a slot in this component.
 */
export function TrustList({ items }: { items: readonly string[] }) {
  if (items.length === 0) return null;

  return (
    <ul className="mt-5 grid gap-3 border-t border-[var(--color-border)] pt-5">
      {items.map((item) => (
        <li key={item} className="type-caption grid grid-cols-[18px_minmax(0,1fr)] gap-2.5">
          <Check aria-hidden="true" className="h-4 w-4 text-[var(--color-success)]" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
