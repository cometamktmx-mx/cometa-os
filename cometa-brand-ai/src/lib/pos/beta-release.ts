import "server-only";
import { parseUpdateMetadata } from "../../../apps/pos-mobile/src/updates";
import downloads from "../../../apps/pos-mobile/config/download-origins.json";
export function betaRelease() {
  if (process.env.COMETA_RUNTIME_ENV !== "beta" && process.env.NODE_ENV !== "development") return null;
  try { return parseUpdateMetadata(JSON.parse(process.env.POS_BETA_RELEASE_METADATA_JSON || "null"), downloads.beta); }
  catch { return null; }
}
