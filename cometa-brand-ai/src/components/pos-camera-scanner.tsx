"use client";

import { useEffect, useRef, useState } from "react";

type Detector = { detect(video: HTMLVideoElement): Promise<Array<{ rawValue: string }>> };
type DetectorConstructor = {
  new(options: { formats: string[] }): Detector;
  getSupportedFormats(): Promise<string[]>;
};

export function PosCameraScanner({ onCode, disabled }: { onCode: (code: string) => Promise<void>; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [device, setDevice] = useState("");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lastCode, setLastCode] = useState("");
  const [ready, setReady] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const armed = useRef(true);
  const callback = useRef(onCode);
  useEffect(() => { callback.current = onCode; }, [onCode]);

  useEffect(() => {
    if (!open) return;
    let disposed = false;
    let stream: MediaStream | undefined;
    let controls: { stop(): void } | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const accept = (code: string) => {
      if (disposed || !armed.current || !code) return;
      armed.current = false;
      setLastCode(code);
      void callback.current(code).catch(() => {
        if (!disposed) setError("No se pudo consultar el código. Usa la búsqueda manual.");
      });
    };
    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("La cámara requiere HTTPS y un navegador compatible.");
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: device ? { deviceId: { exact: device } } : { facingMode: { ideal: "environment" } } });
        if (disposed) { stream.getTracks().forEach(track => track.stop()); return; }
        const element = video.current;
        if (!element) return;
        element.srcObject = stream;
        await element.play();
        const available = await navigator.mediaDevices.enumerateDevices();
        if (disposed) return;
        setDevices(available.filter(item => item.kind === "videoinput"));
        const Native = (window as Window & { BarcodeDetector?: DetectorConstructor }).BarcodeDetector;
        const required = ["ean_13", "ean_8", "code_128", "code_39", "upc_a", "upc_e", "itf"];
        const supported = Native ? await Native.getSupportedFormats() : [];
        if (disposed) return;
        if (Native && required.every(format => supported.includes(format))) {
          const detector = new Native({ formats: required });
          const detect = async () => {
            if (disposed) return;
            try { if (armed.current) { const results = await detector.detect(element); if (results[0]) accept(results[0].rawValue); } }
            catch { /* A frame can be unreadable while focus changes. */ }
            if (!disposed) timer = setTimeout(() => { void detect(); }, 180);
          };
          void detect();
        } else {
          const { BrowserMultiFormatReader } = await import("@zxing/browser");
          if (disposed) return;
          controls = await new BrowserMultiFormatReader().decodeFromStream(stream, element, result => { if (result) accept(result.getText()); });
          if (disposed) { controls.stop(); return; }
        }
        setReady(true);
      } catch (reason) {
        stream?.getTracks().forEach(track => track.stop());
        if (!disposed) setError(reason instanceof DOMException && reason.name === "NotAllowedError" ? "Permite el acceso a la cámara o utiliza el lector físico y la búsqueda manual." : reason instanceof Error ? reason.message : "No se pudo abrir la cámara.");
      }
    }
    void start();
    return () => { disposed = true; if (timer) clearTimeout(timer); controls?.stop(); stream?.getTracks().forEach(track => track.stop()); };
  }, [open, device]);

  return <>
    <button type="button" disabled={disabled} className="mt-3 rounded-lg border px-4 py-2 text-sm disabled:opacity-50" onClick={() => { armed.current = true; setLastCode(""); setError(null); setReady(false); setOpen(true); }}>Escanear código con cámara</button>
    {open && <div role="dialog" aria-modal="true" aria-label="Escanear código" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" onKeyDown={event => { if (event.key === "Escape") setOpen(false); }}>
      <div className="w-full max-w-lg rounded-2xl bg-slate-950 p-5 text-white">
        <div className="flex items-center justify-between"><h2 className="text-lg font-bold">Escanear código</h2><button autoFocus type="button" className="rounded border px-3 py-2" onClick={() => setOpen(false)}>Cerrar cámara</button></div>
        <video ref={video} muted playsInline className="my-4 aspect-video w-full rounded-lg bg-black object-cover" />
        {devices.length > 1 && <label className="block">Cámara<select className="ml-2 max-w-full bg-slate-800 p-2" value={device} onChange={event => { setReady(false); setError(null); setDevice(event.target.value); }}><option value="">Trasera preferida</option>{devices.map((item, index) => <option key={item.deviceId} value={item.deviceId}>{item.label || `Cámara ${index + 1}`}</option>)}</select></label>}
        <p role="status" className="mt-3 text-sm">{error || (lastCode ? `Lectura pausada: ${lastCode}` : ready ? "Apunta al código de barras. Se agregará una sola pieza por lectura." : "Abriendo cámara…")}</p>
        {lastCode && <button type="button" disabled={disabled} className="mt-4 rounded bg-cyan-300 px-4 py-2 text-black disabled:opacity-50" onClick={() => { setLastCode(""); armed.current = true; }}>Escanear otra pieza</button>}
      </div>
    </div>}
  </>;
}
