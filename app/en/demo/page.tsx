import { DemoPage } from "@/components/DemoPage";
import { getMessages } from "@/lib/i18n/messages";

export function generateMetadata() {
  return { title: getMessages("en").demo.pageTitle };
}

export default function EnDemoPage() {
  return <DemoPage locale="en" />;
}
