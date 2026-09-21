import { NextResponse } from "next/server";
import { addCartItem, getOrCreateCart, removeCartItem, updateCartItem } from "@/lib/comu/cart";
import { PosApiError } from "@/lib/pos/server";
import { requireComuFeature } from "@/lib/comu/features";

// Select public data explicitly: the internal context also contains the admin client.
function cartResponse({ buyer, cart, items }: Awaited<ReturnType<typeof getOrCreateCart>>) {
  return NextResponse.json({ ok: true, buyer, cart, items });
}

function fail(error: unknown) {
  const featureDisabled = error instanceof Error && "code" in error && error.code === "COMU_FEATURE_DISABLED";
  const status = error instanceof PosApiError ? error.status : featureDisabled ? 404 : 500;
  return NextResponse.json({
    ok: false,
    code: error instanceof PosApiError ? error.code : featureDisabled ? "COMU_FEATURE_DISABLED" : "COMU_CART_FAILED",
    error: error instanceof PosApiError && status < 500 ? error.message : "No pudimos cargar tu carrito. Inténtalo nuevamente.",
  }, { status });
}
export async function GET() { try { requireComuFeature("catalog"); return cartResponse(await getOrCreateCart()); } catch (error) { return fail(error); } }
export async function POST(request: Request) { try { requireComuFeature("catalog"); const body = await request.json() as { listingId?: unknown; variantListingId?: unknown; quantity?: unknown }; return cartResponse(await addCartItem({ listingId: String(body.listingId || ""), variantListingId: String(body.variantListingId || ""), quantity: Number(body.quantity) })); } catch (error) { return fail(error); } }
export async function PATCH(request: Request) { try { requireComuFeature("catalog"); const body = await request.json() as { itemId?: unknown; quantity?: unknown }; return cartResponse(await updateCartItem(String(body.itemId || ""), Number(body.quantity))); } catch (error) { return fail(error); } }
export async function DELETE(request: Request) { try { requireComuFeature("catalog"); const itemId = new URL(request.url).searchParams.get("itemId") || ""; return cartResponse(await removeCartItem(itemId)); } catch (error) { return fail(error); } }
