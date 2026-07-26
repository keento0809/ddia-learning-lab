import { CSRF_HEADER_NAME } from "@/lib/api/csrfConstants";
import type { GetNoteResponse, NoteRecord, PutNoteRequest } from "@/lib/contracts";
import { readCsrfToken } from "@/lib/progress/csrfToken";

/**
 * T-307 ノート機能。GET/PUT /api/notes/{lessonSlug} のクライアント側fetchラッパ
 * (lib/progress/api.tsの`fetchProgress`/`putProgress`と同じダブルサブミット
 * CSRF cookie方式)。参照設計: 02§3(表#5-6)、02§4.1(右ペインのノート自動保存)。
 */
export class NoteApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "NoteApiError";
  }
}

export async function fetchNote(lessonSlug: string): Promise<GetNoteResponse> {
  const response = await fetch(`/api/notes/${lessonSlug}`, { credentials: "same-origin" });
  if (!response.ok) {
    throw new NoteApiError(response.status, `GET /api/notes/${lessonSlug} failed (${response.status})`);
  }
  return (await response.json()) as GetNoteResponse;
}

export async function putNote(lessonSlug: string, bodyMd: string): Promise<NoteRecord | null> {
  const csrfToken = readCsrfToken();
  const requestBody: PutNoteRequest = { bodyMd };
  const response = await fetch(`/api/notes/${lessonSlug}`, {
    method: "PUT",
    credentials: "same-origin",
    headers: {
      "content-type": "application/json",
      ...(csrfToken ? { [CSRF_HEADER_NAME]: csrfToken } : {}),
    },
    body: JSON.stringify(requestBody),
  });
  if (!response.ok) {
    throw new NoteApiError(response.status, `PUT /api/notes/${lessonSlug} failed (${response.status})`);
  }
  const data = (await response.json()) as GetNoteResponse;
  return data.note;
}
