import { redirect } from "next/navigation";
import { requirePosAdminSurfaceAccess } from "@/lib/pos/admin-access";
import { PosApiError } from "@/lib/pos/server";
import { PosFoodModifiersAdmin } from "../../../components/pos-food-modifiers-admin";

export default async function FoodModifiersPage({params}:{params:Promise<{brandSlug:string}>}) {
  const {brandSlug}=await params;
  try { await requirePosAdminSurfaceAccess(brandSlug); }
  catch(error) {
    if(error instanceof PosApiError && error.status===401) redirect(`/login?next=${encodeURIComponent(`/brand/${brandSlug}/pos/admin/modifiers`)}`);
    if(error instanceof PosApiError && error.status===403) redirect(`/brand/${brandSlug}/pos`);
    throw error;
  }
  return <PosFoodModifiersAdmin brandSlug={brandSlug} />;
}
