import type { ReactNode } from "react";
import { resolveComuAccountAccess } from "@/lib/comu/account-access";
import { getAdminClient } from "@/lib/pos/server";
import SellerShell from "./seller-shell";
import "./seller.css";

export default async function SellerLayout({ children }: { children: ReactNode }) {
  const access = await resolveComuAccountAccess();
  const stores = access?.stores || [];
  const branding = stores.length ? await getAdminClient().from("comu_sellers").select("id,slug").in("id", stores.map(s => s.id)) : { data: [], error: null };
  if (branding.error) throw new Error("COMU_SELLER_BRANDING_UNAVAILABLE");
  return <SellerShell stores={stores.map(s => ({ ...s, publicSlug: branding.data?.find(b => b.id === s.id)?.slug || null }))}>{children}</SellerShell>;
}
