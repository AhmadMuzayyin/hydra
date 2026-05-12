import { PengaturanClient } from "@/components/pages/pengaturan-client";
import { getCurrentUser } from "@/lib/auth";
import { getSettings } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function PengaturanPage() {
  const user = await getCurrentUser();
  const settings = await getSettings();

  return <PengaturanClient settings={settings} userRole={user?.role} />;
}
