import { Link } from "@/lib/i18n/navigation";
import { getMessages, formatMessage, type Locale } from "@/lib/i18n/messages";

export function Footer({ locale }: { locale: Locale }) {
  const messages = getMessages(locale);
  const t = messages.footer;
  const nav = messages.nav;

  return (
    <footer className="mt-auto flex flex-wrap items-center justify-between gap-4 border-t border-neutral-200 px-4 py-4 text-sm text-neutral-600 dark:border-neutral-800 dark:text-neutral-400">
      <nav aria-label={t.navAriaLabel} className="flex gap-4">
        <Link href="/learn" prefetch={false} className="hover:underline">
          {nav.learn}
        </Link>
        <Link href="/glossary" prefetch={false} className="hover:underline">
          {nav.glossary}
        </Link>
      </nav>
      <p>{formatMessage(t.copyright, { year: new Date().getFullYear() })}</p>
    </footer>
  );
}
