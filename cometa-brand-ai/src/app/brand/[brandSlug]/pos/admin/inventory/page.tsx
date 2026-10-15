import { redirect } from 'next/navigation';
import { requirePosAdminSurfaceAccess } from '@/lib/pos/admin-access';
import { getPosMode } from '@/lib/pos/staff-server';
import { PosApiError } from '@/lib/pos/server';
import { PosFoodRecipesAdmin } from '../../../components/pos-food-recipes-admin';
export default async function FoodInventoryPage({ params }: { params: Promise<{ brandSlug: string }> }) {
  const { brandSlug } = await params;
  try { const context = await requirePosAdminSurfaceAccess(brandSlug); if (await getPosMode(context) === 'RETAIL') redirect(`/brand/${brandSlug}/pos/inventory`); }
  catch (error) {
    if (error instanceof PosApiError && error.status === 401) redirect(`/login?next=${encodeURIComponent(`/brand/${brandSlug}/pos/admin/inventory`)}`);
    if (error instanceof PosApiError && error.status === 403) redirect(`/brand/${brandSlug}/pos`);
    throw error;
  }
  return <PosFoodRecipesAdmin brandSlug={brandSlug} />;
}
