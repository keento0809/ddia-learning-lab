"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { signOut } from "next-auth/react";
import type { AccountRecord } from "@/lib/settings/schemas";
import { AccountApiError } from "@/lib/settings/api";
import { useDeleteAccountMutation } from "@/lib/settings/useDeleteAccountMutation";
import { useRouter } from "@/lib/i18n/navigation";
import { formatMessage, getMessages, type Locale } from "@/lib/i18n/messages";

const FOCUSABLE_SELECTOR = "input, button:not([disabled])";

/**
 * S-10設定画面「アカウント削除」(T-308、01§7.1・02§2.1)。
 * フロー: 確認ダイアログ(タイプ確認式、登録メールアドレスの再入力)→
 * DELETE /api/account(論理削除→即時物理削除、workers/api/src/routes/account.ts)
 * →signOut()でこのブラウザのセッションcookieも破棄→サインイン画面へ遷移。
 *
 * ネイティブ<dialog>要素は使わない: このリポジトリのテスト環境(jsdom)は
 * HTMLDialogElement.showModal/closeを実装しておらず(このタスクで実機確認済み)、
 * component単体テストが書けなくなる。モーダル用ライブラリ
 * (@radix-ui/react-alert-dialog等)も未導入(CLAUDE.md規則1により未依頼の依存
 * 追加はしない)ため、React state制御のrole="dialog"パネルで代替する。
 *
 * qa-evaluator指摘対応: 破壊的操作の確認ダイアログのため、開いた時に確認入力へ
 * フォーカスを移し、Tabキーでダイアログ内のみを循環するフォーカストラップ、
 * Escapeでの取り消しを実装する。削除リクエスト送信中(mutation.isPending)は
 * 「キャンセル」やEscapeで見た目上ダイアログを閉じても進行中のDELETEが中断
 * されるわけではなく「キャンセルしたのに削除されサインアウトさせられた」という
 * 欺瞞的な体験になるため、送信中はキャンセル操作自体を無効化する。
 */
export function DeleteAccountSection({ account, locale }: { account: AccountRecord; locale: Locale }) {
  const t = getMessages(locale).settings.danger;
  const [isOpen, setIsOpen] = useState(false);
  const [confirmationEmail, setConfirmationEmail] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const mutation = useDeleteAccountMutation();
  const router = useRouter();
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmInputRef = useRef<HTMLInputElement>(null);

  const canConfirm = confirmationEmail.trim().toLowerCase() === account.email.toLowerCase();

  useEffect(() => {
    if (isOpen) {
      confirmInputRef.current?.focus();
    }
  }, [isOpen]);

  function openDialog() {
    setConfirmationEmail("");
    setErrorMessage("");
    setIsOpen(true);
  }

  function closeDialog() {
    if (mutation.isPending) return;
    setIsOpen(false);
  }

  function handleDialogKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeDialog();
      return;
    }
    if (event.key !== "Tab" || !dialogRef.current) return;

    const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canConfirm) return;
    setErrorMessage("");
    try {
      await mutation.mutateAsync(confirmationEmail);
    } catch (error) {
      setErrorMessage(
        error instanceof AccountApiError && error.status === 400 ? t.errorMismatch : t.errorGeneric,
      );
      return;
    }
    await signOut({ redirect: false });
    router.push("/auth/signin");
  }

  return (
    <section
      aria-labelledby="settings-danger-heading"
      className="flex flex-col gap-4 rounded border border-red-300 p-4 dark:border-red-800"
    >
      <h2 id="settings-danger-heading" className="text-lg font-semibold text-red-700 dark:text-red-400">
        {t.heading}
      </h2>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">{t.description}</p>
      <button
        type="button"
        onClick={openDialog}
        data-testid="settings-delete-open"
        className="w-fit rounded bg-red-700 px-4 py-2 text-sm text-white hover:bg-red-800"
      >
        {t.openDialog}
      </button>

      {isOpen && (
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="settings-delete-dialog-title"
          data-testid="settings-delete-dialog"
          onKeyDown={handleDialogKeyDown}
          className="rounded-md border border-neutral-300 p-6 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50"
        >
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <h3 id="settings-delete-dialog-title" className="text-base font-semibold">
              {t.dialogTitle}
            </h3>
            <div className="flex flex-col gap-1">
              <label htmlFor="settings-delete-confirm-input" className="text-sm font-medium">
                {formatMessage(t.confirmLabel, { email: account.email })}
              </label>
              <input
                ref={confirmInputRef}
                id="settings-delete-confirm-input"
                type="text"
                autoComplete="off"
                value={confirmationEmail}
                onChange={(event) => setConfirmationEmail(event.target.value)}
                placeholder={t.confirmPlaceholder}
                data-testid="settings-delete-confirm-input"
                className="w-full rounded border border-neutral-300 bg-white px-3 py-2 text-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50"
              />
            </div>
            {errorMessage && (
              <p
                role="alert"
                data-testid="settings-delete-error"
                className="text-sm text-red-600 dark:text-red-400"
              >
                {errorMessage}
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={closeDialog}
                disabled={mutation.isPending}
                data-testid="settings-delete-cancel"
                className="rounded border border-neutral-300 px-4 py-2 text-sm disabled:opacity-50 dark:border-neutral-700"
              >
                {t.cancel}
              </button>
              <button
                type="submit"
                disabled={!canConfirm || mutation.isPending}
                data-testid="settings-delete-confirm"
                className="rounded bg-red-700 px-4 py-2 text-sm text-white hover:bg-red-800 disabled:opacity-50"
              >
                {mutation.isPending ? t.deleting : t.confirmButton}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
