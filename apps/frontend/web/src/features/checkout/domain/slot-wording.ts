/**
 * The appointment as words: the civil date it falls on, and the two clock
 * times it runs between.
 *
 * Three strings rather than one sentence, so the page decides the punctuation
 * and the translations decide the order. Nothing here is a `Date` any more —
 * the caller is about to print these, and a component that receives an
 * instant is a component that will eventually format it itself, in whichever
 * zone the machine it is running on happens to be in.
 */
export interface SlotWording {
  /** The civil date, capitalised — "Sábado, 5 de setembro". */
  date: string;
  /** The start, in that date's own clock — "00:30". */
  start: string;
  /** The end, likewise. */
  end: string;
}

/**
 * A locale that leaves its weekday lowercase — every Romance one — reads
 * wrong as a standalone line above a booking, where an English or German
 * reader's already starts with a capital. Applied to the code point rather
 * than the character so a locale whose first letter is a surrogate pair is
 * not cut in half.
 */
function capitalise(text: string): string {
  const [first] = text;
  return first ? first.toLocaleUpperCase() + text.slice(first.length) : text;
}

/**
 * When the appointment is, **in the service's own zone** and never in the
 * device's.
 *
 * `timeZone` is passed explicitly at every call rather than defaulted,
 * because a default is how the device's zone gets back in. This exact
 * substitution has already cost this flow once: a service in `Africa/Maputo`
 * read on a device clocked to UTC put checkout's step-1 grid on the wrong
 * civil date, under a confirm button that stayed live — see
 * `ChooseWhenPage.chosenCivilDate`. Step 3 prints the time rather than
 * offering a grid of them, so the same mistake here does not draw an empty
 * page: it tells the customer a different appointment to the one they will
 * get, and they find out when nobody comes.
 *
 * **A zone this cannot use throws, deliberately.** `Intl.DateTimeFormat`
 * raises on a string that is not a real IANA zone, and nothing here catches
 * it. The alternatives are worse: falling back to UTC, or to the device,
 * prints a wrong time as confidently as a right one. `Provider.update`
 * already refuses a non-IANA zone (`TIMEZONE_INVALID`) and
 * `bookingReadModel.timezone` refuses a blank one, so a value that reaches
 * here and throws is a defect upstream worth seeing — the same bargain
 * `TimeGrid` makes with the zone `availability.forService` hands it.
 */
export function slotWording(
  startsAt: string,
  endsAt: string,
  locale: string,
  timeZone: string,
): SlotWording {
  const day = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone,
  });
  const clock = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  });

  return {
    // The *start's* date, not the end's. A job running to midnight belongs to
    // the day it began on, which is the day the customer will be waiting.
    date: capitalise(day.format(new Date(startsAt))),
    start: clock.format(new Date(startsAt)),
    end: clock.format(new Date(endsAt)),
  };
}
