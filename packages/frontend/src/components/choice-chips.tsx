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
 * of the tab order and defeat the entire point — and a sibling `<label>`
 * is styled from the input's real state via Tailwind's `peer-checked:` and
 * `peer-disabled:` variants. The visual and the semantic state share one
 * source of truth — the input's own `checked`/`disabled` — so they cannot
 * drift apart the way a JS-mirrored "isSelected" boolean could.
 */

export interface ChoiceOption {
  value: string;
  label: string;
  /** Shown under the label in the chip. Omit for a plain chip. */
  hint?: string;
  disabled?: boolean;
}

/**
 * The "selected" and "disabled" looks are always-on `peer-checked:` /
 * `peer-disabled:` utilities rather than a cva variant chosen from a
 * component-computed boolean — the same reasoning as the file doc comment.
 * Selected matches `badge.tsx`'s `info` tone exactly (full-strength
 * `--color-primary` text on a `color-mix` tint of itself), so a selected
 * chip and an informational badge read as the same colour decision.
 */
const chipVariants = cva(
  cn(
    "type-body-medium flex min-w-0 cursor-pointer select-none flex-col items-start gap-0.5",
    "rounded-[var(--radius-field)] border border-[var(--color-border)] px-3 py-2 text-left transition-colors",
    "peer-checked:border-transparent peer-checked:bg-[color-mix(in_srgb,var(--color-primary)_12%,transparent)] peer-checked:text-[var(--color-primary)]",
    "peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--color-ring)] peer-focus-visible:ring-offset-2",
    "peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
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
              className="peer sr-only"
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
              className="peer sr-only"
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
