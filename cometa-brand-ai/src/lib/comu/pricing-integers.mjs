// Database/API money is decimal MXN. Arithmetic is integer cents; snapshots
// retain their existing MXN fields because the reservation RPC consumes them.
/** @param {unknown} value @param {number} decimals @returns {number} */
export function scaledInteger(value, decimals) {
    if ((typeof value !== "number" && typeof value !== "string") || !/^\d+(?:\.\d+)?$/.test(String(value)))
        unavailable();
    const [whole, fraction = ""] = String(value).split(".");
    if (fraction.slice(decimals).replace(/0/g, ""))
        unavailable();
    const result = BigInt(whole) * BigInt(10) ** BigInt(decimals) + BigInt(fraction.slice(0, decimals).padEnd(decimals, "0"));
    if (result > BigInt(Number.MAX_SAFE_INTEGER))
        unavailable();
    return Number(result);
}
/** @returns {never} */
export function unavailable() {
    throw Object.assign(new Error("COMU_PRICE_UNAVAILABLE"), { status: 409, code: "COMU_PRICE_UNAVAILABLE" });
}
/** @param {unknown} value @param {boolean} [positive] @returns {number} */
export function moneyCents(value, positive = false) {
    const cents = scaledInteger(value, 2);
    if (positive && cents <= 0)
        unavailable();
    return cents;
}
/** @param {number} value @param {number} multiplier @param {number} divisor @returns {number} */
export function roundedRatio(value, multiplier, divisor) {
    if (![value, multiplier, divisor].every(Number.isSafeInteger) || value < 0 || multiplier < 0 || divisor <= 0)
        unavailable();
    const result = (BigInt(value) * BigInt(multiplier) + BigInt(divisor) / BigInt(2)) / BigInt(divisor);
    if (result > BigInt(Number.MAX_SAFE_INTEGER))
        unavailable();
    return Number(result);
}
/** @param {number} unitCents @param {unknown} quantity @returns {number} */
export function lineCents(unitCents, quantity) {
    const units = scaledInteger(quantity, 3);
    if (units <= 0)
        unavailable();
    return roundedRatio(unitCents, units, 1000);
}
/** @param {number} cents @returns {number} */
export function mxn(cents) {
    if (!Number.isSafeInteger(cents) || cents < 0)
        unavailable();
    return Number(`${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`);
}
