import { API_BASE_URL } from "@/shared/lib/api/auth-client";

export interface GraphqlErrorEntry {
  message: string;
  extensions?: {
    /** Coarse kit classification: FORBIDDEN, NOT_FOUND, CONFLICT, … */
    code?: string;
    /** The fine-grained domain code, e.g. NOT_PROVIDER_MEMBER. */
    originalCode?: string;
  };
}

/**
 * A GraphQL operation that failed. `code` is the backend's stable domain code
 * (see the provider BC's domain/exceptions) — branch on it, never on `message`.
 */
export class GraphqlError extends Error {
  readonly status: number;
  readonly errors: GraphqlErrorEntry[];
  /**
   * The domain code to branch on — `originalCode` when the backend supplied
   * one, else the coarse kit code.
   *
   * VERIFIED ON THE WIRE: a forbidden read returns
   * `{ code: "FORBIDDEN", originalCode: "NOT_PROVIDER_MEMBER" }`. Reading
   * `code` alone would collapse every authorization failure into one bucket
   * and make specific UI copy impossible.
   */
  readonly code?: string;
  /** The coarse kit classification, kept for transport-level decisions. */
  readonly kitCode?: string;

  constructor(status: number, errors: GraphqlErrorEntry[]) {
    super(errors[0]?.message ?? `HTTP ${status}`);
    this.name = "GraphqlError";
    this.status = status;
    this.errors = errors;
    const ext = errors[0]?.extensions;
    this.code = ext?.originalCode ?? ext?.code;
    this.kitCode = ext?.code;
  }
}

/**
 * POST a query or mutation to the private, session-authenticated endpoint.
 *
 * A GraphQL failure normally arrives as HTTP 200 with a populated `errors`
 * array — NOT as a 4xx — so a status check alone would silently return
 * `undefined` data. Throw on either signal.
 */
export async function sessionGraphql<T>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}/graphql`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      // Required by the server's CSRF-prevention plugin.
      "x-graphql-csrf": "1",
    },
    body: JSON.stringify({ query, variables }),
  });

  const body = (await response.json()) as {
    data?: T;
    errors?: GraphqlErrorEntry[];
  };

  if (!response.ok || (body.errors && body.errors.length > 0)) {
    throw new GraphqlError(response.status, body.errors ?? []);
  }
  return body.data as T;
}
