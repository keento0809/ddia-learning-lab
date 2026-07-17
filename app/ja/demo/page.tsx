import { DemoPage } from "@/components/DemoPage";
import { getMessages } from "@/lib/i18n/messages";

export function generateMetadata() {
  return { title: getMessages("ja").demo.pageTitle };
}

export default function JaDemoPage() {
  return <DemoPage locale="ja" />;
}
