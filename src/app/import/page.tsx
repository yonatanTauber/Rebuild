import { redirect } from "next/navigation";

export default function LegacyImportPage() {
  redirect("/settings/import");
}
