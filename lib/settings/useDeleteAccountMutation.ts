"use client";

import { useMutation } from "@tanstack/react-query";
import { deleteAccount } from "./api";

/**
 * DELETE /api/account のmutation(T-308)。削除後の signOut()・遷移は
 * 呼び出し元(DeleteAccountSection)がonSuccessで行う(このhookはAPI呼び出しのみ)。
 */
export function useDeleteAccountMutation() {
  return useMutation({
    mutationFn: (confirmationEmail: string) => deleteAccount(confirmationEmail),
  });
}
