/**
 * The platform's defaults, as this context needs to read them.
 *
 * Only the seed values are exposed here. A bounded context that can read every
 * knob will end up branching on knobs that are none of its business, and the
 * settings table would quietly become a global variable with a schema.
 */
export interface PlatformSettingsPort {
  /**
   * The customer-side fee to stamp onto a new workspace, in basis points.
   *
   * Read once, at creation. Never consulted again for that provider — the
   * point of copying it is that the rate a business signed up under does not
   * move when the platform's default does.
   */
  defaultCommissionBps(): Promise<number>;
}
