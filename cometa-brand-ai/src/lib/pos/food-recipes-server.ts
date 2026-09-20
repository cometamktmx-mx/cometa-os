import 'server-only';
import { requirePosAdminSurfaceAccess } from './admin-access';
import { requirePosCommercialAccess } from './access';
import { getPosMode, requireStaffSession } from './staff-server';
import { PosApiError, requiredText, uuidValue } from './server';
import { FOOD_RECIPE_ACTIONS, type FoodRecipeAction } from './food-recipes-shared';

export async function requireFoodRecipesAdmin(brandSlug: string, locationId: string) {
  const context = await requirePosAdminSurfaceAccess(brandSlug);
  if (await getPosMode(context) === 'RETAIL') throw new PosApiError(403, 'POS_FOOD_REQUIRED', 'Esta administración requiere un perfil Food.');
  await requirePosCommercialAccess(context, 'pos.inventory');
  await requirePosCommercialAccess(context, 'pos.products');
  const session = await requireStaffSession(context, 'STAFF_MANAGE', locationId);
  return { context, session };
}

export function recipeCommand(body: Record<string, unknown>) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new PosApiError(400, 'POS_VALIDATION_ERROR', 'La solicitud debe ser un objeto JSON.');
  if (typeof body.action !== 'string' || !FOOD_RECIPE_ACTIONS.includes(body.action as FoodRecipeAction)) throw new PosApiError(400, 'POS_VALIDATION_ERROR', 'Acción de inventario o receta inválida.');
  const action = body.action as FoodRecipeAction;
  const payload: Record<string, unknown> = {};
  function id(key: string, optional = false) {
    payload[key] = uuidValue(body[key], key, !optional);
  }
  function text(key: string, max = 180, optional = false) {
    if (optional && (body[key] == null || (typeof body[key] === 'string' && !body[key].trim()))) { payload[key] = null; return; }
    if (typeof body[key] !== 'string') throw new PosApiError(400, 'POS_VALIDATION_ERROR', `Texto inválido: ${key}.`);
    payload[key] = requiredText(body[key], key, max);
  }
  function number(key: string, min: number, max: number, optional = false) {
    const value = body[key];
    if (optional && value == null) return;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new PosApiError(400, 'POS_VALIDATION_ERROR', `Cantidad inválida: ${key}.`);
    payload[key] = value;
  }
  function active() {
    if (typeof body.active !== 'boolean') throw new PosApiError(400, 'POS_VALIDATION_ERROR', 'Estado inválido.');
    payload.active = body.active;
  }
  id('command_key');
  id('id', action === 'ingredient_save' || action === 'product_save' || action === 'image_save' || action === 'effect_save');
  if (action === 'ingredient_save') {
    text('name'); text('category', 30); text('unit_code', 20); text('supplier_name', 180, true);
    number('initial_quantity', 0, 99999999999, true); number('minimum_quantity', 0, 99999999999); number('waste_percent', 0, 99.9999); active();
    if (!Array.isArray(body.presentations) || body.presentations.length > 30) throw new PosApiError(400, 'POS_VALIDATION_ERROR', 'Presentaciones inválidas.');
    payload.presentations = body.presentations.map(value => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new PosApiError(400, 'POS_VALIDATION_ERROR', 'Presentación inválida.');
      const row = value as Record<string, unknown>;
      if (typeof row.name !== 'string' || typeof row.unit_code !== 'string' || (row.supplier_name != null && typeof row.supplier_name !== 'string')) throw new PosApiError(400, 'POS_VALIDATION_ERROR', 'Nombre, unidad o proveedor inválido.');
      if (typeof row.content !== 'number' || !Number.isFinite(row.content) || row.content <= 0 || typeof row.cost !== 'number' || !Number.isFinite(row.cost) || row.cost < 0 || typeof row.active !== 'boolean') throw new PosApiError(400, 'POS_VALIDATION_ERROR', 'Contenido, costo o estado de presentación inválido.');
      return { id: uuidValue(row.id, 'presentationId', false), name: requiredText(row.name, 'presentationName', 180), content: row.content, unit_code: requiredText(row.unit_code, 'unit_code', 20), cost: row.cost, supplier_name: row.supplier_name ? requiredText(row.supplier_name, 'supplier_name', 180) : null, active: row.active };
    });
  } else if (action === 'ingredient_status') active();
  else if (action === 'adjust') { number('quantity', -99999999999, 99999999999); text('notes', 500); }
  else if (action === 'cost_set') { number('content', 0.000001, 99999999999); number('cost', 0, 99999999999); text('unit_code', 20); }
  else if (action === 'receive') { id('presentation_id'); id('request_key'); number('quantity', 1, 99999999999); text('notes', 500, true); }
  else if (action === 'product_save') { text('name'); text('description', 2000, true); id('category_id', true); number('price', 0, 99999999999); number('tax_rate', 0, 100); active(); }
  else if (action === 'image_save') { text('image_url', 1000, true); }
  else if (action === 'recipe_publish') {
    if (!Array.isArray(body.components) || body.components.length < 1 || body.components.length > 100) throw new PosApiError(400, 'POS_VALIDATION_ERROR', 'Agrega entre 1 y 100 componentes.');
    payload.components = body.components.map(value => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new PosApiError(400, 'POS_VALIDATION_ERROR', 'Componente inválido.');
      const row = value as Record<string, unknown>;
      if (typeof row.unit_code !== 'string') throw new PosApiError(400, 'POS_VALIDATION_ERROR', 'Unidad de receta inválida.');
      if (typeof row.quantity !== 'number' || !Number.isFinite(row.quantity) || row.quantity <= 0) throw new PosApiError(400, 'POS_VALIDATION_ERROR', 'Cantidad de receta inválida.');
      return { ingredient_variant_id: uuidValue(row.ingredient_variant_id, 'ingredient_variant_id'), quantity: row.quantity, unit_code: requiredText(row.unit_code, 'unit_code', 20) };
    });
  } else {
    id('product_id'); id('option_id'); text('effect', 20);
    if (!['NONE', 'ADD', 'REMOVE', 'REPLACE'].includes(String(body.effect))) throw new PosApiError(400, 'POS_VALIDATION_ERROR', 'Impacto inválido.');
    if (body.effect === 'REMOVE' || body.effect === 'REPLACE') id('source_variant_id');
    if (body.effect === 'ADD' || body.effect === 'REPLACE') id('ingredient_variant_id');
    if (body.quantity != null) { number('quantity', 0.000001, 99999999999); text('unit_code', 20); }
  }
  return { action, payload };
}
