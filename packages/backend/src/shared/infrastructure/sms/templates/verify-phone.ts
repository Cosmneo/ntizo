/**
 * Body of the phone-verification SMS.
 *
 * Kept to one short line on purpose: providers bill per 160-character segment
 * (70 if any character is non-GSM-7), so an extra sentence is an extra charge
 * on every signup. Plain ASCII for the same reason — an accented character
 * would push the whole message into the shorter unicode encoding.
 *
 * English, like the email templates. Localising this while the emails stay
 * English would leave the two halves of the same signup speaking different
 * languages; see docs/superpowers/follow-ups.md.
 */
export function verifyPhoneTemplate(code: string): string {
  return `${code} is your Ntizo verification code. It expires in 5 minutes.`;
}
