import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (file) => readFileSync(join(root, file), "utf8");

const files = {
  migration: "supabase/migrations/20260825_pos_cash_close_v1.sql",
  cashSessionsApi: "src/app/api/pos/cash-sessions/route.ts",
  cashMovementsApi: "src/app/api/pos/cash-movements/route.ts",
  bootstrapApi: "src/app/api/pos/bootstrap/route.ts",
  cashPage: "src/app/brand/[brandSlug]/pos/cash/page.tsx",
  saleEngine: "supabase/migrations/20260812_loyalty_v4b2a_sale_engine.sql",
  suite: "supabase/tests/pos_cash_close_v1_suite.sql",
};

const source = Object.fromEntries(
  Object.entries(files).map(([name, file]) => [name, read(file)])
);
const checks = [];

function check(name, fn) {
  try {
    fn();
    checks.push({ name, passed: true });
  } catch (error) {
    checks.push({
      name,
      passed: false,
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

check("Movement RPC and open-session guard are present", () => {
  assert.match(source.migration, /FUNCTION public\.pos_create_cash_movement/);
  assert.match(source.migration, /FUNCTION public\.pos_cash_movement_assert_open_session/);
  assert.match(source.migration, /BEFORE INSERT ON public\.pos_cash_movements/);
  assert.match(source.migration, /FOR UPDATE/);
  assert.match(source.migration, /POS_CASH_MOVEMENT_SESSION_CLOSED/);
});

check("Movement ledger is append-only", () => {
  assert.match(source.migration, /FUNCTION public\.pos_cash_movement_append_only/);
  assert.match(source.migration, /BEFORE UPDATE OR DELETE ON public\.pos_cash_movements/);
  assert.match(source.migration, /POS_CASH_MOVEMENT_APPEND_ONLY/);
});

check("Closed sessions protect financial closure fields", () => {
  assert.match(source.migration, /FUNCTION public\.pos_cash_session_protect_closed_financials/);
  assert.match(source.migration, /OLD\.status = 'closed'/);
  assert.match(source.migration, /NEW\.expected_cash IS DISTINCT FROM OLD\.expected_cash/);
  assert.match(source.migration, /POS_CASH_SESSION_CLOSED_IMMUTABLE/);
});

check("Summary follows applied cash amounts and session scope", () => {
  assert.match(source.migration, /payment\.payment_method = 'cash'/);
  assert.match(source.migration, /sale\.cash_session_id/);
  assert.match(source.migration, /movement\.cash_session_id/);
  assert.doesNotMatch(source.migration, /tendered_amount/);
  assert.doesNotMatch(source.migration, /change_amount/);
});

check("Close engine stays untouched and V4 retains its session lock", () => {
  assert.doesNotMatch(source.migration, /FUNCTION public\.pos_close_cash_session/);
  assert.doesNotMatch(source.migration, /FUNCTION public\.pos_complete_sale_v4/);
  assert.match(source.saleEngine, /FROM public\.pos_cash_sessions[\s\S]*?FOR UPDATE/);
});

check("Cash routes enforce existing read and operate permissions", () => {
  assert.match(source.cashSessionsApi, /requireCashPermission\(access, "pos\.cash\.read"\)/);
  assert.match(source.cashSessionsApi, /requireCashPermission\(access, "pos\.cash\.operate"\)/);
  assert.match(source.cashMovementsApi, /requireCashPermission\(access, "pos\.cash\.read"\)/);
  assert.match(source.cashMovementsApi, /requireCashPermission\(access, "pos\.cash\.operate"\)/);
  assert.match(source.cashMovementsApi, /requirePosOperationalAccess/);
});

check("Blind close redacts expected cash before closure", () => {
  assert.match(source.cashSessionsApi, /expected_cash: canReceiveExpected[\s\S]*?: null/);
  assert.match(source.cashSessionsApi, /p_include_expected_cash: canViewOpenExpectedCash\(access\)/);
  assert.match(source.bootstrapApi, /expected_cash: null/);
  assert.match(source.cashPage, /Conteo ciego activo/);
  assert.match(source.cashPage, /Se revela al cerrar/);
});

check("Cash UI has movement controls and guided close", () => {
  assert.match(source.cashPage, /Movimiento de caja/);
  assert.match(source.cashPage, /Registrar movimiento/);
  assert.match(source.cashPage, /Paso 1 de 3 · Resumen/);
  assert.match(source.cashPage, /Paso 2 de 3 · Conteo ciego/);
  assert.match(source.cashPage, /Paso 3 de 3 · Confirmación/);
  assert.match(source.cashPage, /Resultado del corte/);
});

check("Movement client contract omits tenant authority and edit/delete UI", () => {
  assert.match(source.cashMovementsApi, /type CashMovementBody = \{[\s\S]*?cashSessionId[\s\S]*?movementType[\s\S]*?amount[\s\S]*?reason/);
  assert.doesNotMatch(source.cashMovementsApi, /brandSlug\?: unknown/);
  assert.doesNotMatch(source.cashMovementsApi, /export async function PUT|export async function DELETE/);
  assert.doesNotMatch(source.cashPage, /Editar movimiento|Eliminar movimiento/);
});

check("Rollback suite covers the Cash Close V1 foundation", () => {
  assert.match(source.suite, /^BEGIN;/m);
  assert.match(source.suite, /^ROLLBACK;/m);
  assert.match(source.suite, /pos_create_cash_movement/);
  assert.match(source.suite, /pos_close_cash_session/);
  assert.match(source.suite, /pos_complete_sale_v4/);
  for (let index = 1; index <= 23; index += 1) {
    assert.match(source.suite, new RegExp(`'${String(index).padStart(2, "0")}'`));
  }
});

const failed = checks.filter((item) => !item.passed);
for (const item of checks) {
  console.log(
    `${item.passed ? "PASS" : "FAIL"} ${item.name}${
      item.detail ? ` — ${item.detail}` : ""
    }`
  );
}

console.log(
  JSON.stringify({
    total: checks.length,
    passed: checks.length - failed.length,
    failed: failed.length,
    allChecksPassed: failed.length === 0,
  })
);

if (failed.length) process.exitCode = 1;
