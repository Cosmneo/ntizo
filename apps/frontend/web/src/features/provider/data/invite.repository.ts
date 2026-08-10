import { queryOptions } from "@tanstack/react-query";
import { publicGraphql } from "@/shared/lib/graphql/public-graphql";
import { sessionGraphql } from "@/shared/lib/graphql/session-graphql";
import type { PublicInvite } from "../domain/types";

const READ = `
  query InviteRead($input: InviteReadInput!) {
    inviteRead(input: $input) {
      providerName inviterName role email status expiresAt
    }
  }`;

/**
 * Read over the *anonymous* endpoint, on purpose.
 *
 * The token is the credential — it was mailed to one address and to nobody
 * else — so this works before there is a session. That is the whole point: the
 * page has to say what is being joined before asking someone to make an
 * account for it.
 */
export const inviteQueries = {
  byToken: (token: string) =>
    queryOptions({
      queryKey: ["invite", token],
      queryFn: async (): Promise<PublicInvite | null> => {
        const d = await publicGraphql<{ inviteRead: PublicInvite | null }>(READ, {
          input: { token },
        });
        return d.inviteRead;
      },
      // An invitation does not change while someone reads the page, and a
      // refetch on focus would re-run it behind an accept that just landed.
      staleTime: 60_000,
      retry: false,
    }),
};

export async function declineInvite(token: string) {
  const d = await sessionGraphql<{ providerInvitesDecline: { declined: boolean } }>(
    `mutation($input: ProviderInvitesDeclineInput!) {
       providerInvitesDecline(input: $input) { declined }
     }`,
    { input: { token } },
  );
  return d.providerInvitesDecline;
}
