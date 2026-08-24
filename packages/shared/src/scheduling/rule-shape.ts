/**
 * A rule's three nullable columns, resolved to the numbers the engine wants.
 *
 * One function, in the shared package, because the provider's own preview and
 * the customer's calendar must resolve a default the same way. Two copies of
 * "null means 30" is how they stop agreeing.
 */

/**
 * What a rule that says nothing means.
 *
 * `capacity: 1` is load-bearing, not a placeholder: one barber cuts one head
 * at a time, and any higher default would silently oversell every provider
 * who never opened the field.
 */
export const SCHEDULING_DEFAULTS = {
  bufferMinutes: 0,
  slotIntervalMinutes: 30,
  capacity: 1,
} as const;

export interface RuleShapeInput {
  readonly bufferMinutes: number | null;
  readonly slotIntervalMinutes: number | null;
  readonly capacity: number | null;
}

export interface ResolvedRuleShape {
  readonly bufferMinutes: number;
  readonly gridMinutes: number;
  readonly capacity: number;
  /** False when the rule said `0` — the window is open and offers nothing to pick. */
  readonly offersSlots: boolean;
}

export function resolveRuleShape(rule: RuleShapeInput): ResolvedRuleShape {
  // `??` throughout, never `||`: zero is a real answer for both the buffer
  // and the grid, and `||` would read each of them as "unset".
  const gridMinutes = rule.slotIntervalMinutes ?? SCHEDULING_DEFAULTS.slotIntervalMinutes;
  return {
    bufferMinutes: rule.bufferMinutes ?? SCHEDULING_DEFAULTS.bufferMinutes,
    gridMinutes,
    capacity: rule.capacity ?? SCHEDULING_DEFAULTS.capacity,
    offersSlots: gridMinutes > 0,
  };
}
