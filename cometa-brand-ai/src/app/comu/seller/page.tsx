import { redirect } from "next/navigation";
import { requireComuActor } from "@/lib/comu/seller-access";

export default async function ComuSellerPage() {
  const actor = await requireComuActor();
  if (actor.isAdmin) redirect("/workspace");
  const { data: comuMemberships, error: comuError } = await actor.admin.from("comu_seller_memberships").select("seller_id").eq("user_id", actor.userId).eq("active", true);
  if (comuError) throw new Error("COMU_MEMBERSHIP_LOOKUP_FAILED");
  const ids = (comuMemberships || []).map(row => row.seller_id);
  const { data: preparingSellers, error: preparingError } = ids.length ? await actor.admin.from("comu_sellers").select("id,brand_slug,public_name").in("id", ids).eq("approval_origin", "C1").in("status", ["PREPARING", "ACTIVE"]) : { data: [], error: null };
  if (preparingError) throw new Error("COMU_SELLER_LOOKUP_FAILED");
  if (preparingSellers?.length === 1) redirect(`/comu/seller/${encodeURIComponent(preparingSellers[0].brand_slug)}/summary`);
  if (preparingSellers && preparingSellers.length > 1) return <main><h1>Tus tiendas COMU</h1>{preparingSellers.map(seller => <p key={seller.id}><a href={`/comu/seller/${encodeURIComponent(seller.brand_slug)}/summary`}>{seller.public_name}</a></p>)}</main>;

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
