import * as React from "react";
import { cva } from "class-variance-authority";
import { cn } from "../lib/utils";

/**
 * Chip-style choices, single- and multi-select, built on native
 * `<input type="radio">` / `<input type="checkbox">` rather than a
 * `role="radiogroup"` reimplementation.
 *
 * The browser already gives a native radio group arrow-key navigation
 * within the set, one tab stop for the whole group landing on the checked
 * option, and correct "3 of 7" announcement; native checkboxes already
 * toggle on space and are each their own tab stop. Reproducing that with
 * `<button role="radio">` and roving `tabIndex` means reimplementing all of
 * it by hand, and a chip row that looks better than a `Select` while being
 * worse to operate is a strictly negative change for the screen it lands on.
 *
 * Each input is visually hidden with the `sr-only` pattern — clipped, not
 * `display:none` or `visibility:hidden`, either of which would pull it out
 * of the tab order and defeat the entire point — and its enclosing `<label>`
 * is styled from the input's real state via Tailwind's `has-*` variants. The
 * visual and the semantic state share one source of truth — the input's own
 * `checked`/`disabled` — so they cannot drift apart the way a JS-mirrored
 * "isSelected" boolean could.
 */

export interface ChoiceOption {
  value: string;
  label: string;
  /** Shown under the label in the chip. Omit for a plain chip. */
  hint?: string;
  disabled?: boolean;
}

/**
 * The "selected" and "disabled" looks are always-on utilities rather than a
 * cva variant chosen from a component-computed boolean — the same reasoning
 * as the file doc comment. Selected matches `badge.tsx`'s `info` tone exactly
 * (full-strength `--color-primary` text on a `color-mix` tint of itself), so a
 * selected chip and an informational badge read as the same colour decision.
 *
 * `has-[…]` and not `peer-…`, and the difference is not cosmetic. The input
 * lives *inside* this label, so it is styled by whether the label CONTAINS a
 * checked input. `peer-checked:` compiles to `.peer:checked ~ &` — a
 * following-sibling combinator, which cannot reach a parent — so the whole
 * selected look silently never applied. Nothing in jsdom could see it: no
 * stylesheet is loaded, every state assertion reads the input's own
 * `checked`, and the chips rendered identically selected and unselected in a
 * real browser for as long as it took somebody to look at one.
 */
const chipVariants = cva(
  cn(
    "type-body-medium flex min-w-0 cursor-pointer select-none flex-col items-start gap-0.5",
    "rounded-[var(--radius-field)] border border-[var(--color-border)] px-3 py-2 text-left transition-colors",
    "has-[:checked]:border-transparent has-[:checked]:bg-[color-mix(in_srgb,var(--color-primary)_12%,transparent)] has-[:checked]:text-[var(--color-primary)]",
    "has-[:focus-visible]:outline-none has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--color-ring)] has-[:focus-visible]:ring-offset-2",
    "has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50",
  ),
);

function ChipHint({ hint }: { hint?: string }) {
  if (!hint) return null;
  return <span className="type-caption text-[var(--color-muted-foreground)]">{hint}</span>;
}

function ChipLegend({ legend, showLegend }: { legend: string; showLegend: boolean | undefined }) {
  return <legend className={showLegend ? "type-body-medium mb-2" : "sr-only"}>{legend}</legend>;
}

function ChipError({ id, error }: { id: string; error: string | undefined }) {
  if (!error) return null;
  return (
    <p id={id} className="type-caption mt-2 text-[var(--color-destructive)]">
      {error}
    </p>
  );
}

export function ChoiceChips({
  name,
  legend,
  options,
  value,
  onChange,
  showLegend,
  error,
}: {
  name: string;
  legend: string;
  options: readonly ChoiceOption[];
  value: string | null;
  onChange: (value: string) => void;
  /** Renders the legend visually; otherwise it is available only to a screen reader. */
  showLegend?: boolean;
  error?: string | undefined;
}) {
  const errorId = `${name}-error`;
  return (
    // `role="radiogroup"` is explicit because a bare `<fieldset>` maps to
    // the accessible role `group`, not `radiogroup` — without it,
    // `getByRole("radiogroup", { name })` (and any AT relying on that role)
    // finds nothing. This is not the hand-rolled-ARIA pattern the file doc
    // comment warns against: it names the group for its accessible-name
    // contract and touches neither keyboard handling nor focus, both of
    // which stay entirely native.
    <fieldset role="radiogroup" aria-describedby={error ? errorId : undefined}>
      <ChipLegend legend={legend} showLegend={showLegend} />
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <label key={option.value} className={chipVariants()}>
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              disabled={option.disabled}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            <span>{option.label}</span>
            <ChipHint hint={option.hint} />
          </label>
        ))}
      </div>
      <ChipError id={errorId} error={error} />
    </fieldset>
  );
}

export function ChoiceChipsMulti({
  name,
  legend,
  options,
  value,
  onChange,
  showLegend,
  error,
}: {
  name: string;
  legend: string;
  options: readonly ChoiceOption[];
  value: readonly string[];
  onChange: (value: string[]) => void;
  showLegend?: boolean;
  error?: string | undefined;
}) {
  const errorId = `${name}-error`;
  return (
    <fieldset aria-describedby={error ? errorId : undefined}>
      <ChipLegend legend={legend} showLegend={showLegend} />
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <label key={option.value} className={chipVariants()}>
            <input
              type="checkbox"
              name={name}
              value={option.value}
              checked={value.includes(option.value)}
              disabled={option.disabled}
              onChange={(event) => {
                onChange(
                  event.target.checked
                    ? [...value, option.value]
                    : value.filter((v) => v !== option.value),
                );
              }}
              className="sr-only"
            />
            <span>{option.label}</span>
            <ChipHint hint={option.hint} />
          </label>
        ))}
      </div>
      <ChipError id={errorId} error={error} />
    </fieldset>
  );
}
