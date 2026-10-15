import { PosApiError } from "@/lib/pos/server";
import * as integers from "./pricing-integers.mjs";

export function unavailable(): never {
  throw new PosApiError(409, "COMU_PRICE_UNAVAILABLE", "El precio no está disponible. Actualiza tu carrito.");
}
function checked(calculate: () => number): number {
  try { return calculate(); } catch { return unavailable(); }
}
export const scaledInteger = (value: unknown, decimals: number) => checked(() => integers.scaledInteger(value, decimals));
export const moneyCents = (value: unknown, positive = false) => checked(() => integers.moneyCents(value, positive));
export const roundedRatio = (value: number, multiplier: number, divisor: number) => checked(() => integers.roundedRatio(value, multiplier, divisor));
export const lineCents = (unitCents: number, quantity: unknown) => checked(() => integers.lineCents(unitCents, quantity));
export const mxn = (cents: number) => checked(() => integers.mxn(cents));
