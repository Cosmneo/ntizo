import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateMyProfile, userQueries } from "@/features/user/data/user.repository";
import type { UpdateMyProfileInput } from "@/features/user/data/user.repository";

/**
 * The only path from the account UI to the profile mutation.
 *
 * `ui/` may not reach `data/` directly — the boundaries lint rejects it — and
 * the indirection earns its place here anyway: the cache invalidation belongs
 * with the write, not repeated at every form that performs one.
 */
export function useUpdateMyProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateMyProfileInput) => updateMyProfile(input),
    onSuccess: () => {
      // The header, the account menu and this page all read `user.me`. A
      // name changed here has to reach the avatar's initials too.
      void qc.invalidateQueries({ queryKey: userQueries.me().queryKey });
    },
  });
}
