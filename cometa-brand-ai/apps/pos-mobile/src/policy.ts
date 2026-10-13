export type Brand = { id: string; slug: string; name: string; locations: { id: string; name: string }[] };
export function brandDestination(brands: Brand[]) { return brands.length === 0 ? "empty" : brands.length === 1 ? "single" : "selector"; }
export function localOrigin(value: string): string {
  const url = new URL(value);
  const h = url.hostname;
  const local = h === "localhost" || h === "127.0.0.1" || h === "[::1]" || /^10\.\d+\.\d+\.\d+$/.test(h) || /^192\.168\.\d+\.\d+$/.test(h) || /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(h);
  if (!local || !["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("M2 permite únicamente un backend local certificado.");
  return url.origin;
}
export const onboardingKey = "cometa-pos-onboarding-v1";
export const hasSeenOnboarding = (storage: Pick<Storage, "getItem">) => storage.getItem(onboardingKey) === "yes";
export const markOnboardingSeen = (storage: Pick<Storage, "setItem">) => storage.setItem(onboardingKey, "yes");
export function networkState(status?: number) { return status === 401 ? "auth" : status === 403 ? "denied" : status ? "server" : "offline"; }
