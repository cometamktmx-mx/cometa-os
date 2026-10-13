import { useSyncExternalStore } from "react";

export type PosLayout = "phone" | "tablet-portrait" | "tablet-landscape";
// CSS viewport, never UA/model. A 600px short edge is a tablet layout budget.
export function layoutForViewport(width: number, height: number): PosLayout {
  if (Math.min(width, height) < 600) return "phone";
  return width > height ? "tablet-landscape" : "tablet-portrait";
}
function subscribe(callback: () => void) {
  window.addEventListener("resize", callback);
  return () => window.removeEventListener("resize", callback);
}
export function usePosLayout(): PosLayout {
  return useSyncExternalStore(subscribe, () => layoutForViewport(window.innerWidth, window.innerHeight), () => "phone");
}
