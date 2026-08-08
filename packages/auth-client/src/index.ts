import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";

// This package publishes its TS source directly (see package.json `exports`)
// and has no build step, so it is compiled as part of whichever Vite app
// imports it. `import.meta.env` below is therefore statically replaced by
// Vite exactly as it would be in app code.
//
// It cannot import the app's `@/shared/lib/env` (that alias only resolves
// inside apps/frontend/web), so the backend-origin default is duplicated
// here in miniature. Keep this in sync with
// apps/frontend/web/src/shared/lib/env.ts if that default ever changes.
const AUTH_API_URL_DEFAULT = "http://localhost:8788";

function readAuthApiUrl(): string {
  const value = import.meta.env.VITE_AUTH_API_URL as string | undefined;
  return value && value.length > 0 ? value : AUTH_API_URL_DEFAULT;
}

// Dev: same-origin ("") so /api/auth/* goes through the Vite proxy (first-party
// cookie). Deployed: target the backend origin directly.
export const API_BASE_URL: string = import.meta.env.DEV ? "" : readAuthApiUrl();

export const authClient = createAuthClient({
  baseURL: API_BASE_URL,
  plugins: [
    inferAdditionalFields({
      user: {
        firstName: { type: "string", required: true },
        lastName: { type: "string", required: true },
        // Declared by the backend and present on the session at runtime.
        // Without it here, session.user.role does not typecheck.
        role: { type: "string", required: false },
      },
    }),
  ],
  fetchOptions: { credentials: "include" },
});

export const { useSession, signOut } = authClient;
