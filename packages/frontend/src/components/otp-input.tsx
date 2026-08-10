import * as React from "react";
import { cn } from "../lib/utils";

export interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Fired once the last box is filled, so the form can submit itself. */
  onComplete?: (value: string) => void;
  length?: number;
  disabled?: boolean;
  /** Receives the 1-based box number — "Digit 3 of 6". */
  digitLabel: (position: number, total: number) => string;
  className?: string;
  autoFocus?: boolean;
}

/**
 * A fixed-length numeric code entry rendered as one box per digit.
 *
 * The boxes are real inputs rather than one styled field, because that is
 * what makes browser SMS autofill and password managers offer the code at
 * all. Everything that would otherwise break as a result — pasting,
 * backspacing across boxes, clicking a box out of order — is handled here.
 *
 * Entry is strictly sequential: focus always lands on the first empty box.
 * That is not just a UX choice. `value` is a compact string, so it cannot
 * represent "digits in boxes 1 and 3, gap at 2" — allowing a click into a
 * later box would let a digit silently slide left into the gap. Keeping
 * entry sequential makes that state unreachable rather than handled.
 */
export function OtpInput({
  value,
  onChange,
  onComplete,
  length = 6,
  disabled,
  digitLabel,
  className,
  autoFocus,
}: OtpInputProps) {
  const refs = React.useRef<Array<HTMLInputElement | null>>([]);

  /** The box the user is meant to be typing into: the first empty one. */
  const cursor = Math.min(value.length, length - 1);

  function commit(next: string) {
    const clean = next.replace(/\D/g, "").slice(0, length);
    onChange(clean);
    if (clean.length === length) onComplete?.(clean);
  }

  /**
   * Focus follows the cursor, but only after the render that moved it.
   *
   * Moving focus inside the change handler instead would race: the handler
   * runs before `value` has re-rendered, so the newly focused box's own
   * `onFocus` still sees the old `cursor` and bounces focus back to the box
   * the user just left — which already holds a digit, so the next keystroke
   * arrives concatenated onto it and the code doubles up.
   *
   * Guarded on already owning focus, so mounting never steals it from the
   * page and `autoFocus` stays the only thing that grabs it.
   */
  React.useEffect(() => {
    const target = refs.current[cursor];
    if (!target || document.activeElement === target) return;
    if (!refs.current.includes(document.activeElement as HTMLInputElement)) return;
    target.focus();
  }, [cursor]);

  function insert(raw: string) {
    const digits = raw.replace(/\D/g, "");
    if (!digits) return;
    // `commit` truncates, so a stray keystroke on a full code is dropped
    // rather than shifting anything.
    commit(value + digits);
    if (value.length + digits.length >= length) {
      refs.current[length - 1]?.blur();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      e.preventDefault();
      commit(value.slice(0, -1));
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    // Replaces rather than appends: a pasted code is the whole code.
    const digits = e.clipboardData.getData("text").replace(/\D/g, "");
    if (!digits) return;
    commit(digits);
    if (digits.length >= length) refs.current[length - 1]?.blur();
  }

  return (
    <div className={cn("flex justify-center gap-2", className)}>
      {Array.from({ length }, (_, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          // Deliberately no maxLength={1}. Browsers differ on SMS autofill:
          // some distribute a code across the boxes, others drop all six
          // digits into the one holding the hint. maxLength would truncate
          // the second case to a single digit and lose the code, whereas
          // `insert` spreads it. Nothing over-fills visually either way —
          // each box renders `value[i]`, which is one character at most.
          //
          // Only the first box carries the hint, since browsers fill the
          // field that has it.
          autoComplete={i === 0 ? "one-time-code" : "off"}
          autoFocus={autoFocus && i === 0}
          disabled={disabled}
          aria-label={digitLabel(i + 1, length)}
          value={value[i] ?? ""}
          onChange={(e) => insert(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          // Clicking box 5 with two digits typed sends focus back to box 3,
          // keeping the filled prefix contiguous. Safe to read `cursor` here
          // because this only fires on user-initiated focus, where `value` is
          // already the rendered one — the programmatic case is the effect's.
          onFocus={() => {
            if (i !== cursor) refs.current[cursor]?.focus();
          }}
          className={cn(
            "h-12 w-11 rounded-md border border-[var(--color-input)] bg-[var(--color-background)]",
            "text-center text-lg font-semibold",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        />
      ))}
    </div>
  );
}
