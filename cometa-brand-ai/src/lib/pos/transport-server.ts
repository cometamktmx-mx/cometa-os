import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { cookies } from "next/headers";

/** Request-local credentials. Never shared across requests or copied to browser cookies. */
export type MobileTransport = {
  bearer: string;
  discovery: boolean;
  values: Map<string, string>;
  changes: Record<string, string | null>;
  authorizeContext?: (userId: string, brandSlug: string, locationId?: string) => void;
};
const scope = new AsyncLocalStorage<MobileTransport>();
export const mobileTransport = () => scope.getStore();
export function withMobileTransport<T>(value: MobileTransport, work: () => T): T { return scope.run(value, work); }
export async function posCookies() {
  const context = scope.getStore();
  if (!context) return cookies();
  return {
    get: (name: string) => { const value = context.values.get(name); return value === undefined ? undefined : { name, value }; },
    getAll: () => [...context.values].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string, options?: unknown) => { void options; context.values.set(name, value); context.changes[name] = value; },
    delete: (name: string) => { context.values.delete(name); context.changes[name] = null; },
  };
}
