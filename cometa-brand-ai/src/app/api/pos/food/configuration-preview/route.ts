import { handlePosError, ok, PosApiError, readJsonBody, requiredText, uuidValue, assertDatabaseResult } from '@/lib/pos/server';
import { assertFoodResult, requireFoodAccess } from '@/lib/pos/food-server';
import { requireFoodVariant } from '@/lib/pos/food-recipes-server';
import type { FoodModifierSelection } from '@/lib/pos/food-shared';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await readJsonBody<Record<string, unknown>>(request);
    const location = uuidValue(body.locationId, 'locationId', true);
    const variantId = uuidValue(body.variantId, 'variantId', true);
    if (!location || !variantId || !Array.isArray(body.modifierOptionIds) || body.modifierOptionIds.length > 100) throw new PosApiError(400, 'POS_VALIDATION_ERROR', 'Configuración inválida.');
    const ids = body.modifierOptionIds.map(id => uuidValue(id, 'optionId', true));
    if (ids.some(id => !id) || new Set(ids).size !== ids.length) throw new PosApiError(400, 'POS_VALIDATION_ERROR', 'Opciones inválidas.');
    const { context, session } = await requireFoodAccess(requiredText(body.brandSlug, 'brandSlug', 120), 'item_add', location);
    const scopedLocation = session.locationId || location;
    const { data: branch, error: branchError } = await context.admin.from('pos_locations').select('id,prices_include_tax').eq('id', scopedLocation).eq('brand_slug', context.brand.slug).eq('active', true).maybeSingle();
    assertDatabaseResult(branchError, 'No se pudo validar la sucursal.');
    if (!branch) throw new PosApiError(403, 'POS_FOOD_FORBIDDEN', 'Sucursal no disponible.');
    let pricesIncludeTax = branch.prices_include_tax;
    if (body.checkId != null) {
      const checkId = uuidValue(body.checkId, 'checkId', true);
      const { data: check, error: checkError } = await context.admin.from('pos_food_checks').select('prices_include_tax').eq('brand_slug', context.brand.slug).eq('location_id', scopedLocation).eq('id', checkId).eq('status', 'OPEN').maybeSingle();
      assertDatabaseResult(checkError, 'No se pudo validar la cuenta.');
      if (!check) throw new PosApiError(403, 'POS_FOOD_FORBIDDEN', 'La cuenta no está disponible en esta sucursal.');
      pricesIncludeTax = check.prices_include_tax;
    }
    const { variant, product } = await requireFoodVariant(context, variantId);
    const { data: resolved, error: resolveError } = await context.admin.rpc('pos_food_resolve_modifiers_v1', { p_brand_slug: context.brand.slug, p_product_id: product.id, p_ids: ids });
    if (resolveError) assertFoodResult(resolveError, null);
    if (!Array.isArray(resolved)) throw new PosApiError(503, 'POS_FOOD_OPERATION_FAILED', 'No se pudieron validar las opciones.');
    const modifiers = resolved as FoodModifierSelection[];
    const cents = Math.round(Number(variant.price) * 100) + modifiers.reduce((sum, option) => sum + Math.round(Number(option.price_delta) * 100), 0);
    if (!Number.isSafeInteger(cents) || cents < 0) throw new PosApiError(409, 'POS_FOOD_MODIFIERS_INVALID', 'Revisa el precio de las opciones.');
    let recipe: Record<string, unknown> | null = null;
    let available: number | null = null;
    let limiting: string | null = null;
    if (product.inventory_mode === 'recipe') {
      const { data, error } = await context.admin.rpc('pos_food_recipe_metrics_v1', { brand: context.brand.slug, location: scopedLocation, variant: variant.id, modifiers });
      assertFoodResult(error, data);
      if (typeof data.availability !== 'number' || !Number.isFinite(data.availability)) throw new PosApiError(409, 'POS_FOOD_RECIPE_REQUIRED', 'La receta no permite calcular disponibilidad.');
      recipe = data;
      available = data.availability;
      limiting = typeof data.limiting_ingredient === 'string' ? data.limiting_ingredient : null;
    } else if (product.inventory_mode === 'direct') {
      const { data, error } = await context.admin.from('pos_inventory').select('quantity,reserved_quantity').eq('brand_slug', context.brand.slug).eq('location_id', scopedLocation).eq('variant_id', variant.id).maybeSingle();
      assertDatabaseResult(error, 'No se pudo consultar la existencia.');
      available = Math.max(0, Number(data?.quantity || 0) - Number(data?.reserved_quantity || 0));
    }
    return ok({ preview: { variantId, recipe, unitPrice: cents / 100, lineTotal: (cents + (pricesIncludeTax ? 0 : Math.round(cents * Number(product.tax_rate || 0) / 100))) / 100, available, canAdd: available === null || available >= 1, reason: available !== null && available < 1 ? `No disponible${limiting ? ': ' + limiting : ''}.` : null } });
  } catch (error) { return handlePosError(error); }
}
