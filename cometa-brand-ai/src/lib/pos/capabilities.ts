export type PosProfileFamily =
  | "retail"
  | "restaurant"
  | "services"
  | "generic";

export type PosCapabilitiesContract = {
  profileCode: string;
  profileFamily: PosProfileFamily;
  effectiveCapabilities: string[];
};

const POS_PROFILE_FAMILIES = new Set<string>([
  "retail",
  "restaurant",
  "services",
  "generic",
]);

export function isPosProfileFamily(value: unknown): value is PosProfileFamily {
  return typeof value === "string" && POS_PROFILE_FAMILIES.has(value);
}

export function isEffectiveCapabilities(value: unknown): value is string[] {
  return Array.isArray(value) &&
    value.every((capability) => typeof capability === "string");
}

export function isRetailFamily(family: PosProfileFamily) {
  return family === "retail";
}

export function isRestaurantFamily(family: PosProfileFamily) {
  return family === "restaurant";
}

export function isServicesFamily(family: PosProfileFamily) {
  return family === "services";
}
