import { safeInternalNext } from "@/lib/auth/safe-next";

export function posReturnTo(next?: string | null, returnTo?: string | null) {
  return safeInternalNext(next, "") || safeInternalNext(returnTo, "");
}

export function posEntryDestination(brands: readonly { slug: string }[], next?: string | null, returnTo?: string | null) {
  return posReturnTo(next, returnTo) || (brands.length === 1 ? `/brand/${encodeURIComponent(brands[0].slug)}/pos` : "/pos");
}
