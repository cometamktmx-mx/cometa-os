import { useEffect, useState } from "react";
import { App as NativeApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { mobileConfig } from "./environment";
import { nativeFetch } from "./transport";
import { parseUpdateMetadata, type UpdateMetadata } from "./updates";
import release from "../release.json";
import downloads from "../config/download-origins.json";
export function UpdateNotice() {
  const [update, setUpdate] = useState<UpdateMetadata | null>(null);
  useEffect(() => {
    if (mobileConfig.channel !== "beta") return;
    let disposed = false, last = 0, active = false;
    const check = async () => {
      if (active || Date.now() - last < 3600000) return;
      active = true; last = Date.now();
      try {
        const response = await nativeFetch(mobileConfig.metadataUrl, { cache: "no-store", signal: AbortSignal.timeout(8000) });
        if (!response.ok) return;
        const next = parseUpdateMetadata(await response.json(), downloads.beta);
        if (!disposed && next.versionCode > release.beta.versionCode) setUpdate(next);
      } catch { /* Unavailable/untrusted metadata never blocks POS. No sensitive logs. */ }
      finally { active = false; }
    };
    void check();
    const sub = Capacitor.isNativePlatform() ? NativeApp.addListener("appStateChange", s => { if (s.isActive) void check(); }) : null;
    return () => { disposed = true; void sub?.then(s => s.remove()); };
  }, []);
  if (!update) return null;
  return <aside role="status" style={{ padding: 16, background: "#173c42", color: "white" }}>
    <p>Nueva versión de COMETA POS disponible: {update.versionName}</p>
    {update.minimumSupportedVersionCode > release.beta.versionCode && <p>Esta versión requiere actualizarse para mantener compatibilidad.</p>}
    <a href={update.downloadUrl} target="_blank" rel="noopener noreferrer">Actualizar</a>
  </aside>;
}
