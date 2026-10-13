import type { UpdateMetadata } from "../../apps/pos-mobile/src/updates";
export function PosMobileDownload({ release, qrUrl }: { release: UpdateMetadata | null; qrUrl?: string }) {
  return <main style={{ minHeight: "100vh", background: "#061019", color: "#f7f9fa", padding: "clamp(24px,6vw,80px)", fontFamily: "system-ui,sans-serif" }}>
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      <p style={{ color: "#62ddce", letterSpacing: ".18em" }}>COMETA POS · BETA</p>
      <h1 style={{ fontSize: "clamp(32px,5vw,54px)", lineHeight: 1.1 }}>COMETA POS para Android</h1>
      <p>Acceso limitado a negocios piloto autorizados. Conexión a Internet requerida.</p>
      <section style={{ padding: 24, margin: "28px 0", border: "1px solid #38505b", borderRadius: 16 }}>
        {release ? <><p>Versión {release.versionName} · código {release.versionCode}</p><p>Publicado: {release.publishedAt}</p><p>Tamaño: {(release.sizeBytes / 1048576).toFixed(2)} MiB</p><p style={{ overflowWrap: "anywhere" }}>SHA-256: <code>{release.sha256}</code></p>
          <a href={release.downloadUrl} style={{ display: "inline-block", background: "#62ddce", color: "#061019", padding: "16px 24px", borderRadius: 8, fontWeight: 700 }}>Descargar APK</a></> : <><h2>Beta en preparación</h2><p>La descarga se habilitará cuando exista una release firmada y verificada.</p><button disabled style={{ padding: 16 }}>Descarga todavía no disponible</button></>}
        <p>Android 7.0 o posterior (API 24). Teléfono o tablet.</p>
      </section>
      <h2>Instalación</h2><ol><li>Descarga el APK desde esta página oficial.</li><li>Si Android lo solicita, permite temporalmente instalar desde tu navegador.</li><li>Confirma la instalación en el instalador de Android.</li><li>Abre COMETA POS e inicia sesión con tu cuenta autorizada.</li><li>Selecciona negocio y sucursal, enrola la terminal e ingresa tu PIN.</li></ol>
      <p>No hay registro público. Solicita acceso y soporte a tu contacto de COMETA para el piloto.</p>
      <h2>Compartir con otro dispositivo</h2>
      {qrUrl ? <img src={qrUrl} alt="QR de la página oficial de descarga COMETA POS Beta" width={220} height={220}/> : <p>QR pendiente de habilitar la página oficial.</p>}
      <p>El QR apuntará a la página estable, no a un archivo temporal.</p>
      <p>Software Beta: puede cambiar durante el piloto. No uses credenciales ni datos de Production.</p>
    </div>
  </main>;
}
