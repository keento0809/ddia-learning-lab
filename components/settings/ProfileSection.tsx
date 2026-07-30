"use client";

import { useState, type FormEvent } from "react";
import type { AccountRecord } from "@/lib/settings/schemas";
import { AccountApiError } from "@/lib/settings/api";
import { useUpdateAccountMutation } from "@/lib/settings/useUpdateAccountMutation";
import { getMessages, type Locale } from "@/lib/i18n/messages";

/** S-10設定画面「プロフィール編集(display_name)」(T-308、01§7.1)。 */
export function ProfileSection({ account, locale }: { account: AccountRecord; locale: Locale }) {
  const t = getMessages(locale).settings.profile;
  const [displayName, setDisplayName] = useState(account.displayName);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const mutation = useUpdateAccountMutation();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("idle");
    try {
      await mutation.mutateAsync({ displayName });
      setStatus("saved");
    } catch (error) {
      setErrorMessage(
        error instanceof AccountApiError && error.status === 400 ? t.errorValidation : t.errorGeneric,
      );
      setStatus("error");
    }
  }

  return (
    <section aria-labelledby="settings-profile-heading" className="flex flex-col gap-4">
      <h2 id="settings-profile-heading" className="text-lg font-semibold">
        {t.heading}
      </h2>
      <form onSubmit={handleSubmit} data-testid="settings-profile-form" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="settings-display-name" className="text-sm font-medium">
            {t.displayNameLabel}
          </label>
          <input
            id="settings-display-name"
            type="text"
            required
            maxLength={50}
            value={displayName}
            onChange={(event) => {
              setDisplayName(event.target.value);
              setStatus("idle");
            }}
            data-testid="settings-display-name-input"
            className="w-full max-w-sm rounded border border-neutral-300 bg-white px-3 py-2 text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50"
          />
        </div>
        {status === "error" && (
          <p role="alert" data-testid="settings-profile-error" className="text-sm text-red-600 dark:text-red-400">
            {errorMessage}
          </p>
        )}
        {status === "saved" && (
          <p data-testid="settings-profile-saved" className="text-sm text-emerald-700 dark:text-emerald-400">
            {t.saved}
          </p>
        )}
        <button
          type="submit"
          disabled={mutation.isPending}
          data-testid="settings-profile-submit"
          className="w-fit rounded bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700 disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
        >
          {mutation.isPending ? t.saving : t.save}
        </button>
      </form>
    </section>
  );
}
