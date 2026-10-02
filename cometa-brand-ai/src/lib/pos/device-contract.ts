// Public contract only. Device credentials, PINs and Supabase tokens are excluded.
export const POS_DEVICE_COOKIE = "cometa_pos_device";
export type PosDevice = {
  id: string;
  hostUserId: string;
  brandSlug: string;
  locationId: string;
  label: string;
  status: "ACTIVE" | "REVOKED";
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  revokedAt: string | null;
};
