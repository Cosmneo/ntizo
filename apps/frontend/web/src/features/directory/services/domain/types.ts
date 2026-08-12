import type { ServiceDTO, ServicePageDTO } from "@ntizo/shared/read-models";

export type { ServiceDTO, ServicePageDTO };

/**
 * The one priced option a card may show.
 *
 * `service.all` already resolves an entire options list down to this single
 * default server-side — see `servicePublicOptionReadModel`. There is no
 * array on the wire for this feature to index into; `NonNullable` just names
 * the shape once instead of every function re-deriving it from `ServiceDTO`.
 */
export type ServicePublicOptionDTO = NonNullable<ServiceDTO["defaultOption"]>;
