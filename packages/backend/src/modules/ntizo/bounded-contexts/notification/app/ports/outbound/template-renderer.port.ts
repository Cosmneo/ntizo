import type { NotificationType } from "@ntizo/shared";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/**
 * A type plus a language plus the snapshot, rendered.
 *
 * `payload` is the notification's own snapshot, unconstrained by design — the
 * template for a type is what knows that type's fields, and is where a wrong
 * assumption should fail rather than in a shared schema nobody can change
 * without touching both sides.
 *
 * Returns `null` for a type with no template. Not a throw: a type can be
 * raised into an inbox before anybody has written its email, and that must
 * leave the inbox row standing rather than failing the whole raise.
 */
export interface TemplateRendererPort {
  render(
    type: NotificationType,
    locale: string,
    payload: Record<string, unknown>,
  ): RenderedEmail | null;
}
