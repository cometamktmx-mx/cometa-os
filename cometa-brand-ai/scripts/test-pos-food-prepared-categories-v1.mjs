import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
const migration = read('supabase/migrations/20260918130000_pos_food_prepared_categories.sql');
const shared = read('src/lib/pos/food-recipes-shared.ts');
const server = read('src/lib/pos/food-recipes-server.ts');
const api = read('src/app/api/pos/food/recipes/route.ts');
const admin = read('src/app/brand/[brandSlug]/components/pos-food-recipes-admin.tsx');
const workspace = read('src/app/brand/[brandSlug]/components/pos-food-prepared-workspace.tsx');
const retail = read('src/app/api/pos/products/route.ts');

test('Food prepared category persistence uses canonical product category_id', () => {
  assert.match(migration, /create or replace function|pg_get_functiondef/);
  assert.match(migration, /pos_categories/);
  assert.match(migration, /brand_slug=brand and active/);
  assert.match(migration, /category_id/);
  assert.match(migration, /category_name/);
});

test('Food parser accepts optional category_id without accepting arbitrary fields', () => {
  assert.match(server, /action === 'product_save'.*id\('category_id', true\)/s);
  assert.match(shared, /category_id: string \| null; category_name: string \| null/);
});

test('Food catalog and workspace load and persist brand categories', () => {
  assert.match(admin, /\/api\/pos\/categories\?brandSlug=/);
  assert.match(admin, /category_id: p\.category_id/);
  assert.match(workspace, /Categoría<select/);
  assert.match(workspace, /productForm\.category_id/);
  assert.match(api, /brand_slug.*context\.brand\.slug|context\.brand\.slug/);
});

test('Retail continues to use the canonical category-aware product API', () => {
  assert.match(retail, /category_id/);
  assert.match(retail, /pos_categories/);
});
