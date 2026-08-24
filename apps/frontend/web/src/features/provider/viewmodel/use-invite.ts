import { useMutation, useQuery } from "@tanstack/react-query";
import { declineInvite, inviteQueries } from "../data/invite.repository";

export function useInvite(token: string | undefined) {
  return useQuery({ ...inviteQueries.byToken(token ?? ""), enabled: !!token });
}

export function useDeclineInvite() {
  return useMutation({ mutationFn: declineInvite });
}
