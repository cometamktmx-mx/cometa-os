import { assertDatabaseResult, handlePosError, ok, PosApiError, readJsonBody, requiredText, uuidValue } from '@/lib/pos/server';
import { requireFoodRecipesAdmin } from '@/lib/pos/food-recipes-server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await readJsonBody<Record<string, unknown>>(request);
    const location = uuidValue(body.locationId, 'locationId', true);
    const productId = uuidValue(body.productId, 'productId', true);
    const id = uuidValue(body.id, 'id', true); // Stable client-generated ID is reused on retries.
    const name = requiredText(body.name, 'name', 100);
    if (!location || !productId || !id || typeof body.price !== 'number' || !Number.isFinite(body.price) || body.price < 0 || body.price > 99999999 || Math.abs(body.price * 100 - Math.round(body.price * 100)) > 0.000001) throw new PosApiError(400, 'POS_VALIDATION_ERROR', 'Revisa el tamaño y precio.');
    const { context } = await requireFoodRecipesAdmin(requiredText(body.brandSlug, 'brandSlug', 120), location);
    const { admin, brand, user } = context;
    const { data: branch, error: branchError } = await admin.from('pos_locations').select('id').eq('id', location).eq('brand_slug', brand.slug).eq('active', true).maybeSingle();
    assertDatabaseResult(branchError, 'No se pudo validar la sucursal.');
    if (!branch) throw new PosApiError(403, 'POS_FOOD_FORBIDDEN', 'La sucursal no está disponible.');
    const { data: product, error } = await admin.from('pos_products').select('id').eq('id', productId).eq('brand_slug', brand.slug).eq('product_type', 'prepared').eq('inventory_mode', 'recipe').eq('active', true).maybeSingle();
    assertDatabaseResult(error, 'No se pudo validar el preparado.');
    if (!product) throw new PosApiError(404, 'POS_FOOD_NOT_FOUND', 'El preparado no está disponible.');
    const { data: existing, error: readError } = await admin.from('pos_product_variants').select('id,product_id,name,price,attributes').eq('brand_slug', brand.slug).eq('id', id).maybeSingle();
    assertDatabaseResult(readError, 'No se pudo validar el tamaño.');
    if (existing && existing.product_id !== productId) throw new PosApiError(403, 'POS_FOOD_FORBIDDEN', 'El tamaño no pertenece al preparado.');
    if (existing) {
      if (body.update !== true && (existing.name !== name || Number(existing.price) !== body.price)) throw new PosApiError(409, 'POS_FOOD_CONFLICT', 'El tamaño ya existe. Ábrelo para editarlo.');
      if (body.update === true) {
        const { error: updateError } = await admin.from('pos_product_variants').update({ name, price: body.price, attributes: { ...(existing.attributes || {}), food_size: name } }).eq('brand_slug', brand.slug).eq('product_id', productId).eq('id', id);
        assertDatabaseResult(updateError, 'No se pudo actualizar el tamaño.');
      }
    } else {
      if (body.update === true) throw new PosApiError(404, 'POS_FOOD_NOT_FOUND', 'No se encontró el tamaño.');
      const { error: insertError } = await admin.from('pos_product_variants').insert({ id, brand_id: brand.id, brand_slug: brand.slug, product_id: productId, name, price: body.price, unit_code: 'piece', is_default: false, attributes: { food_size: name }, variant_signature: '', created_by: user.userId });
      if (insertError?.code === '23505') {
        const { data: retry, error: retryError } = await admin.from('pos_product_variants').select('product_id,name,price').eq('brand_slug', brand.slug).eq('id', id).maybeSingle();
        assertDatabaseResult(retryError, 'No se pudo verificar el tamaño.');
        if (!retry || retry.product_id !== productId || retry.name !== name || Number(retry.price) !== body.price) throw new PosApiError(409, 'POS_FOOD_CONFLICT', 'El tamaño ya existe. Actualiza la lista antes de reintentar.');
      } else assertDatabaseResult(insertError, 'No se pudo crear el tamaño.');
    }
    // No pos_inventory row: a draft size remains unavailable until its recipe is published.
    return ok({ variant: { id, product_id: productId, name, price: body.price } });
  } catch (error) { return handlePosError(error); }
}
