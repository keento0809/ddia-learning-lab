import { getRequestConfig } from "next-intl/server";
import { routing, type AppLocale } from "@/lib/i18n/routing";

function isAppLocale(value: string | undefined): value is AppLocale {
  return !!value && (routing.locales as readonly string[]).includes(value);
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = isAppLocale(requested) ? requested : routing.defaultLocale;

  return { locale };
});
