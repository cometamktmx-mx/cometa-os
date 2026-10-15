export const ACCESS_ROLES = ["owner", "admin", "manager", "cashier", "inventory", "editor", "viewer"] as const;

export type AccessRole = (typeof ACCESS_ROLES)[number];
export type BrandOsAccessStatus = "active" | "paused" | "inactive" | "not_configured";
export type PassivePosProductAvailability = {
  state: "active" | "preparation" | "unavailable";
  available: boolean;
  planCode: string | null;
  lifecycleStatus: string | null;
  reason: "subscription_not_configured" | "lifecycle_access_denied" | "pos_access_not_entitled" | "commercial_access_lookup_failed" | "commercial_access_response_invalid" | null;
};

export type AccessPerson = {
  id: string;
  email: string;
  createdAt: string;
  lastSignInAt: string | null;
  profile: null | { fullName: string | null; role: "admin" | "client" | "team"; status: "active" | "inactive" };
  memberships: Array<{ brandSlug: string; brandName: string; canonicalBrand: boolean; accessRole: AccessRole; status: "active" | "inactive"; osStatus: BrandOsAccessStatus | null; pos: PassivePosProductAvailability | null }>;
  assignments: Array<{ brandSlug: string; brandName: string; role: string; active: boolean; isPrimary: boolean }>;
  workProfile: null | { typicalStart: string | null; targetMinutes: number; workDays: number[] | null; timezone: string };
};
