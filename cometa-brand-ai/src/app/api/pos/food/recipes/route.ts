import { getBrandSlugFromUrl, handlePosError, ok, PosApiError, readJsonBody, requiredText, uuidValue } from '@/lib/pos/server';
import { requireFoodRecipesAdmin, recipeCommand } from '@/lib/pos/food-recipes-server';
import { assertFoodResult } from '@/lib/pos/food-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const location = uuidValue(new URL(request.url).searchParams.get('locationId'), 'locationId') as string;
    const { context, session } = await requireFoodRecipesAdmin(getBrandSlugFromUrl(request), location);
    const { data, error } = await context.admin.rpc('pos_food_recipes_catalog_v1', { brand: context.brand.slug, host: context.user.userId, session: session.id, location });
    assertFoodResult(error, data);
    const { data: imageRows, error: imageError } = await context.admin
      .from('pos_product_variants')
      .select('id,image_url,product:pos_products!inner(image_url,brand_slug)')
      .eq('brand_slug', context.brand.slug);
    if (imageError) throw imageError;
    const images = new Map((imageRows || []).map((row) => [
      row.id,
      typeof row.image_url === 'string' && row.image_url.trim() ? row.image_url : (row.product as { image_url?: string | null } | null)?.image_url || null,
    ]));
    const products = Array.isArray(data.products) ? data.products.map((product) => ({ ...product, image_url: images.get(product.id) || null })) : data.products;
    return ok({ catalog: { ...data, products } });
  } catch (error) { return handlePosError(error); }
}

export async function POST(request: Request) {
  try {
    const body = await readJsonBody<Record<string, unknown>>(request);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new PosApiError(400, 'POS_VALIDATION_ERROR', 'La solicitud debe ser un objeto JSON.');
    const location = uuidValue(body.locationId, 'locationId') as string;
    const { context, session } = await requireFoodRecipesAdmin(requiredText(body.brandSlug, 'brandSlug', 120), location);
    const { action, payload } = recipeCommand(body);
    if (action === 'effects_save') {
      const { data, error } = await context.admin.rpc('pos_food_effects_save_v2', { brand: context.brand.slug, host: context.user.userId, session: session.id, location, product: payload.product_id, option_id: payload.option_id, effects: payload.effects, command_key: payload.command_key });
      assertFoodResult(error, data);
      return ok({ result: data });
    }
    if (action === 'image_save') {
      const imageUrl = typeof payload.image_url === 'string' && payload.image_url ? payload.image_url : null;
      if (imageUrl && !isManagedProductImageUrl(imageUrl, context.brand.slug)) {
        throw new PosApiError(400, 'POS_PRODUCT_IMAGE_URL_INVALID', 'La imagen no pertenece al almacenamiento de productos de esta marca.');
      }
      const { data: variant, error: variantError } = await context.admin
        .from('pos_product_variants')
        .select('product_id,product:pos_products!inner(id,product_type,inventory_mode,brand_slug)')
        .eq('id', payload.id)
        .eq('brand_slug', context.brand.slug)
        .maybeSingle();
      if (variantError) throw variantError;
      const productRows = variant?.product as { id: string; product_type: string; inventory_mode: string; brand_slug: string }[] | null | undefined;
      const product = Array.isArray(productRows) ? productRows[0] : productRows;
      if (!variant || !product || product.brand_slug !== context.brand.slug || product.product_type !== 'prepared' || product.inventory_mode !== 'recipe') {
        throw new PosApiError(404, 'POS_FOOD_NOT_FOUND', 'No se encontró el preparado.');
      }
      const { error: updateError } = await context.admin
        .from('pos_products')
        .update({ image_url: imageUrl })
        .eq('id', product.id)
        .eq('brand_slug', context.brand.slug);
      if (updateError) throw updateError;
      return ok({ result: { id: variant.product_id } });
    }
    const { data, error } = await context.admin.rpc('pos_food_recipes_admin_v1', { brand: context.brand.slug, host: context.user.userId, session: session.id, location, action, payload });
    assertFoodResult(error, data);
    return ok({ result: data });
  } catch (error) { return handlePosError(error); }
}

function isManagedProductImageUrl(imageUrl: string, brandSlug: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return false;
  try {
    const parsed = new URL(imageUrl);
    const origin = new URL(supabaseUrl).origin;
    const prefix = '/storage/v1/object/public/pos-products/';
    if (parsed.origin !== origin || !parsed.pathname.startsWith(prefix)) return false;
    const segments = decodeURIComponent(parsed.pathname.slice(prefix.length)).split('/');
    return segments.length === 3 && segments[0] === brandSlug && isUuid(segments[1]) && /^.+\.(jpg|png|webp)$/i.test(segments[2]) && isUuid(segments[2].replace(/\.(jpg|png|webp)$/i, ''));
  } catch { return false; }
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
