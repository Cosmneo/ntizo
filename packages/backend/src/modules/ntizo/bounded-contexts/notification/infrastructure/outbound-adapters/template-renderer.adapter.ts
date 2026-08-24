import type { NotificationType } from "@ntizo/shared";
import type { RenderedEmail, TemplateRendererPort } from "../../app/ports/outbound/template-renderer.port";
import { TEMPLATE_REGISTRY } from "../templates/registry";

/**
 * A lookup, not a switch.
 *
 * A missing template returns null and the caller records a delivery that never
 * happened rather than failing. The inbox row is already written by then, and
 * losing it because nobody wrote an email would be the tail wagging the dog.
 */
export class LocalTemplateRenderer implements TemplateRendererPort {
  render(
    type: NotificationType,
    locale: string,
    payload: Record<string, unknown>,
  ): RenderedEmail | null {
    const mod = TEMPLATE_REGISTRY[type];
    if (!mod) return null;
    return mod.render(locale, payload);
  }
}
