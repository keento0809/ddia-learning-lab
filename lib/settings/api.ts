import { CSRF_HEADER_NAME } from "@/lib/api/csrfConstants";
import { readCsrfToken } from "@/lib/progress/csrfToken";
import type {
  AccountRecord,
  DeleteAccountResponse,
  GetAccountResponse,
  PatchAccountRequest,
  PatchAccountResponse,
} from "@/lib/settings/schemas";

/**
 * S-10設定画面(T-308)のクライアント側fetchラッパ。lib/notes/api.tsと同じ
 * ダブルサブミットCSRF cookie方式(lib/progress/csrfToken.ts)。
 */
export class AccountApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly problemTitle: string | null,
    message: string,
  ) {
    super(message);
    this.name = "AccountApiError";
  }
}

async function toApiError(response: Response, fallbackMessage: string): Promise<AccountApiError> {
  const problem = (await response.json().catch(() => null)) as { title?: string } | null;
  return new AccountApiError(response.status, problem?.title ?? null, fallbackMessage);
}

export async function fetchAccount(): Promise<AccountRecord> {
  const response = await fetch("/api/account", { credentials: "same-origin" });
  if (!response.ok) {
    throw await toApiError(response, `GET /api/account failed (${response.status})`);
  }
  const data = (await response.json()) as GetAccountResponse;
  return data.account;
}

export async function patchAccount(request: PatchAccountRequest): Promise<AccountRecord> {
  const csrfToken = readCsrfToken();
  const response = await fetch("/api/account", {
    method: "PATCH",
    credentials: "same-origin",
    headers: {
      "content-type": "application/json",
      ...(csrfToken ? { [CSRF_HEADER_NAME]: csrfToken } : {}),
    },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    throw await toApiError(response, `PATCH /api/account failed (${response.status})`);
  }
  const data = (await response.json()) as PatchAccountResponse;
  return data.account;
}

export async function deleteAccount(confirmationEmail: string): Promise<DeleteAccountResponse> {
  const csrfToken = readCsrfToken();
  const response = await fetch("/api/account", {
    method: "DELETE",
    credentials: "same-origin",
    headers: {
      "content-type": "application/json",
      ...(csrfToken ? { [CSRF_HEADER_NAME]: csrfToken } : {}),
    },
    body: JSON.stringify({ confirmationEmail }),
  });
  if (!response.ok) {
    throw await toApiError(response, `DELETE /api/account failed (${response.status})`);
  }
  return (await response.json()) as DeleteAccountResponse;
}
