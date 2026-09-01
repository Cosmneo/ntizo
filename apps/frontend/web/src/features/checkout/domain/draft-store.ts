/**
 * What checkout's step 2 collects, on its way to step 3.
 *
 * `addressId` rather than the address itself: the customer picks a row out of
 * their own address book, and step 3 reads the full record back out of the
 * same list this page rendered. Carrying a copy of the fields here would be a
 * second version of an address that can be edited in another tab.
 */
export interface DraftDetails {
  /** Which saved address, or `null` while the customer has not picked one. */
  addressId: string | null;
  /** What the customer wrote about the job — `""` when they wrote nothing. */
  description: string;
}

/**
 * One key per booking, never one key for "the checkout".
 *
 * A customer holds one draft at a time, but they can hold it in a tab where a
 * *previous* booking's details are still sitting in storage, and a shared key
 * would hand the second booking the first one's address. Keying by the id the
 * page is addressed by makes that impossible rather than unlikely.
 */
const KEY_PREFIX = "ntizo.checkout.";

/**
 * Written and immediately removed by `canStoreDraftDetails`. Under the same
 * prefix so it cannot collide with anything else the app stores, and never a
 * booking id, so a probe cannot be mistaken for somebody's details.
 */
const PROBE_KEY = `${KEY_PREFIX}probe`;

function keyFor(bookingId: string): string {
  return `${KEY_PREFIX}${bookingId}`;
}

/**
 * The tab's own store, or `null` when there is not one.
 *
 * The guard wraps the *property access*, not merely the call: a browser set
 * to refuse site data throws on `globalThis.sessionStorage` itself, before
 * there is any object to call a method on. `?.` alone does not survive that.
 */
function tabStore(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * Whether this browser will actually keep what step 2 collects.
 *
 * **Probed with a write, because a read proves nothing.** A private window
 * throws on the access itself, but a store at its quota reads back perfectly
 * and refuses the next `setItem` — and the failure that matters here is the
 * write, since the whole point is that step 3 can read the details later. So
 * this writes a probe value and removes it again.
 *
 * The caller uses this to *say so* rather than to degrade quietly. Letting a
 * customer fill in an address on a page that cannot keep it means discovering
 * the loss at the confirm step, with nothing to show for the typing; a
 * sentence naming the cause is a worse experience than a working browser and
 * a far better one than a form that silently forgets.
 */
export function canStoreDraftDetails(): boolean {
  const store = tabStore();
  if (!store) return false;
  try {
    store.setItem(PROBE_KEY, "1");
    store.removeItem(PROBE_KEY);
    return true;
  } catch {
    return false;
  }
}

/**
 * Remember what step 2 has collected so far.
 *
 * `sessionStorage`, not component state and not the server. Not the server
 * because this design writes exactly twice — `booking.create` at the start
 * and `booking.submit` at the end — and a write in between would leave a row
 * that is neither an abandoned draft nor a request anybody sent, plus a
 * second place for the address to disagree with itself. Not component state
 * because a reload of step 2 would then lose what the customer typed, where
 * the tab scope is exactly right for a purchase in progress: gone when the
 * tab closes, invisible to every other tab's checkout.
 *
 * Failure is silent on purpose. A full quota or a private window is not a
 * reason to stop checkout; the cost is that step 3 arrives with nothing
 * filled in, which is a worse page rather than a broken one.
 */
export function saveDraftDetails(bookingId: string, details: DraftDetails): void {
  try {
    tabStore()?.setItem(keyFor(bookingId), JSON.stringify(details));
  } catch {
    // Deliberately swallowed — see above.
  }
}

/**
 * What step 2 collected for this booking, or `null` when there is nothing to
 * read.
 *
 * `null` covers every way this comes up empty — no store, a store that
 * throws, no entry, or an entry that is not the shape this module wrote — and
 * the caller treats all of them the same way: start the form empty. None of
 * them is worth telling the customer about, because there is nothing they
 * could do differently.
 */
export function readDraftDetails(bookingId: string): DraftDetails | null {
  let raw: string | null;
  try {
    raw = tabStore()?.getItem(keyFor(bookingId)) ?? null;
  } catch {
    return null;
  }
  if (raw === null) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { addressId, description } = parsed as Record<string, unknown>;
    // Read field by field rather than trusted wholesale: this value is a
    // string anybody with a console open can rewrite, and the page's state
    // types are what the rest of the flow relies on.
    return {
      addressId: typeof addressId === "string" ? addressId : null,
      description: typeof description === "string" ? description : "",
    };
  } catch {
    return null;
  }
}
