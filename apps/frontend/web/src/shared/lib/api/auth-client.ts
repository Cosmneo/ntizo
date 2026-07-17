import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";
import { AUTH_API_URL } from "@/shared/lib/env";

// Dev: same-origin ("") so /api/auth/* goes through the Vite proxy (first-party
// cookie). Deployed: target the backend origin directly.
export const API_BASE_URL = import.meta.env.DEV ? "" : AUTH_API_URL;

export const authClient = createAuthClient({
  baseURL: API_BASE_URL,
  plugins: [
    inferAdditionalFields({
      user: {
        firstName: { type: "string", required: true },
        lastName: { type: "string", required: true },
      },
    }),
  ],
  fetchOptions: { credentials: "include" },
});

export const { useSession, signOut } = authClient;
