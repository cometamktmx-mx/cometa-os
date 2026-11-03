import { retailPermissions } from "./retail-permissions";
import type { PosStaffSession } from "./staff-server";

// Authority comes only from the active PIN operator, never the host account.
export function canSuperviseRetailCash(operator: PosStaffSession | null) {
  return !!operator && retailPermissions(operator.staff).includes("CASH") && retailPermissions(operator.staff).includes("REPORTS");
}
export function blindOpenCash<T extends { status: string }>(session: T) {
  if (session.status !== "open") return session;
  const s = session as T & Record<string, unknown>;
  return {
    id: s.id, status: s.status, register_id: s.register_id, location_id: s.location_id,
    opened_at: s.opened_at, closed_at: null, opening_staff_id: s.opening_staff_id,
    openingStaffName: s.openingStaffName, register: s.register, location: s.location,
    opening_amount: null, expected_cash: null, counted_cash: null, difference: null,
    summary: null, retailDeposits: null,
  };
}
