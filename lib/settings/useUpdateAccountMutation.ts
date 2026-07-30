"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AccountRecord, PatchAccountRequest } from "@/lib/settings/schemas";
import { patchAccount } from "./api";
import { ACCOUNT_QUERY_KEY } from "./useAccountQuery";

/** PATCH /api/account のmutation(T-308)。成功時にGET /api/accountのキャッシュを更新する。 */
export function useUpdateAccountMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: PatchAccountRequest) => patchAccount(request),
    onSuccess: (account: AccountRecord) => {
      queryClient.setQueryData(ACCOUNT_QUERY_KEY, account);
    },
  });
}
