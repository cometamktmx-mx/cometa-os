import "server-only";

import { NextResponse } from "next/server";
import { BrandOsGuardError } from "@/lib/brand-os/server";

/**
 * Keeps API responses safe while preserving the legacy `ok` and `success`
 * flags that existing clients inspect.
 */
export function brandContextErrorResponse(error: unknown) {
  if (error instanceof BrandOsGuardError) {
    return NextResponse.json(
      {
        ok: false,
        success: false,
        code: error.code,
        error: error.message,
      },
      { status: error.status }
    );
  }

  console.error("COMETA_OS_API_INTERNAL_ERROR:", error);

  return NextResponse.json(
    {
      ok: false,
      success: false,
      code: "INTERNAL_ERROR",
      error: "No se pudo completar la operaciÃ³n.",
    },
    { status: 500 }
  );
}

export function invalidRequestResponse(message: string) {
  return NextResponse.json(
    {
      ok: false,
      success: false,
      code: "INVALID_REQUEST",
      error: message,
    },
    { status: 400 }
  );
}
