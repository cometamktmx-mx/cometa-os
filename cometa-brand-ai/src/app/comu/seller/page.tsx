import { redirect } from "next/navigation";
import { requireComuActor } from "@/lib/comu/seller-access";

export default async function ComuSellerPage() {
  const actor = await requireComuActor();
  if (actor.isAdmin) redirect("/workspace");

  const { data: memberships, error: membershipError } = await actor.admin
    .from("user_brand_access")
    .select("brand_slug,access_role")
    .eq("user_id", actor.userId)
    .eq("status", "active")
    .in("access_role", ["owner", "admin"]);

  if (membershipError) redirect("/workspace");
  const brandSlugs = [...new Set((memberships || []).map((row) => String(row.brand_slug || "")).filter(Boolean))];
  if (brandSlugs.length !== 1) redirect("/workspace");
  const brandSlug = brandSlugs[0];
  if (!brandSlug) redirect("/workspace");

  const { data: seller, error: sellerError } = await actor.admin
    .from("comu_sellers")
    .select("brand_slug,status")
    .eq("brand_slug", brandSlug)
    .eq("status", "ACTIVE")
    .maybeSingle();

  if (sellerError || !seller) redirect("/workspace");
  redirect(`/brand/${encodeURIComponent(brandSlug)}/comu`);
}
