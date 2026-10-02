"use client";

import { clearPosLocalContext } from "./offline-storage";

/** Same-origin cookie transport. Never expose the device credential to JS. */
export async function unenrollPosDevice(brandSlug: string, deviceId: string) {
  const response = await fetch("/api/pos/devices", {
    method: "DELETE", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ brandSlug, deviceId }),
  });
  const body = await response.json();
  if (body.clearLocalContext || response.status === 401 || response.status === 403) await clearPosLocalContext();
  if (!response.ok) throw new Error(body.error || "No se pudo desenrolar la terminal.");
  return { revoked: body.revoked === true, clearLocalContext: body.clearLocalContext === true };
}
