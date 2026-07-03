"use client";

import { useEffect, useMemo, useState } from "react";

type GenerationStatus = "idle" | "generating" | "done" | "error";

type PresetKey = "short-detail" | "top-detail" | "full-catalog" | "free";

const DEFAULT_PROMPT =
  "haz una imagen de 1080x1350px juntando ambas fotos, en fondo blanco claro de estudio, ambas fotos en un mismo fondo, sin modificar la ropa, no cambies el color de la ropa, la idea es enfocar el short, recorta la cabeza, solo enfoca al short y al detalle.";

const PRESETS: {
  key: PresetKey;
  name: string;
  subtitle: string;
  prompt: string;
}[] = [
  {
    key: "short-detail",
    name: "Short + detalle",
    subtitle: "El prompt que ya te funciona.",
    prompt: DEFAULT_PROMPT,
  },
  {
    key: "top-detail",
    name: "Top + espalda",
    subtitle: "Enfoca top, tirantes y espalda.",
    prompt:
      "haz una imagen de 1080x1350px juntando ambas fotos, en fondo blanco claro de estudio, ambas fotos en un mismo fondo, sin modificar la ropa ni la cara de la modelo, no cambies el color de la ropa, la idea es enfocar el top, los tirantes, la espalda y los detalles de la prenda.",
  },
  {
    key: "full-catalog",
    name: "Catálogo completo",
    subtitle: "Ambas poses completas y limpias.",
    prompt:
      "haz una imagen de 1080x1350px juntando ambas fotos, en fondo blanco claro de estudio, ambas fotos en un mismo fondo, sin modificar la ropa ni la cara de la modelo, no cambies el color de la ropa, separa las modelos de forma natural, que no se toquen entre los tenis, que se vea como una fotografía premium de catálogo.",
  },
  {
    key: "free",
    name: "Prompt libre",
    subtitle: "Escribe tu instrucción manual.",
    prompt: DEFAULT_PROMPT,
  },
];

function slugifyBrand(value: string) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getStoredBrandSlug() {
  if (typeof window === "undefined") return "";

  const directSlug = localStorage.getItem("cometa_current_brand_slug");
  if (directSlug) return directSlug;

  const selectedMemory = localStorage.getItem("cometa_selected_business_memory");
  if (!selectedMemory) return "";

  try {
    const parsed = JSON.parse(selectedMemory);

    if (parsed?.brandSlug) return slugifyBrand(parsed.brandSlug);
    if (parsed?.brandName) return slugifyBrand(parsed.brandName);

    return "";
  } catch {
    return "";
  }
}

function createPreviewUrl(file: File | null, setPreview: (url: string) => void) {
  if (!file) {
    setPreview("");
    return () => {};
  }

  const objectUrl = URL.createObjectURL(file);
  setPreview(objectUrl);

  return () => URL.revokeObjectURL(objectUrl);
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const link = document.createElement("a");

  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

async function cropDataUrlTo1080x1350(dataUrl: string) {
  return new Promise<string>((resolve, reject) => {
    const image = new Image();

    image.onload = () => {
      const width = 1080;
      const height = 1350;
      const canvas = document.createElement("canvas");

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");

      if (!ctx) {
        reject(new Error("No se pudo preparar la imagen para descarga."));
        return;
      }

      const targetRatio = width / height;
      const sourceRatio = image.width / image.height;

      let sx = 0;
      let sy = 0;
      let sw = image.width;
      let sh = image.height;

      if (sourceRatio > targetRatio) {
        sw = image.height * targetRatio;
        sx = (image.width - sw) / 2;
      } else {
        sh = image.width / targetRatio;
        sy = (image.height - sh) / 2;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(image, sx, sy, sw, sh, 0, 0, width, height);

      resolve(canvas.toDataURL("image/png", 1));
    };

    image.onerror = () => reject(new Error("No se pudo leer la imagen."));
    image.src = dataUrl;
  });
}

function UploadCard({
  id,
  title,
  subtitle,
  file,
  previewUrl,
  onChange,
  onRemove,
}: {
  id: string;
  title: string;
  subtitle: string;
  file: File | null;
  previewUrl: string;
  onChange: (file: File | null) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-[32px] border border-slate-200 bg-white p-4 shadow-[0_18px_70px_rgba(15,23,42,0.06)]">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-black text-slate-950">{title}</p>
          <p className="mt-1 text-xs font-bold leading-5 text-slate-400">
            {subtitle}
          </p>
        </div>

        {file ? (
          <button
            type="button"
            onClick={onRemove}
            className="rounded-full bg-rose-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-rose-600 ring-1 ring-rose-100 transition hover:bg-rose-100"
          >
            Quitar
          </button>
        ) : null}
      </div>

      <label
        htmlFor={id}
        className="group flex min-h-[320px] cursor-pointer items-center justify-center overflow-hidden rounded-[26px] border border-dashed border-slate-300 bg-slate-50 transition hover:border-cyan-300 hover:bg-cyan-50/40"
      >
        {previewUrl ? (
          <img
            src={previewUrl}
            alt={title}
            className="h-full max-h-[440px] w-full object-contain"
          />
        ) : (
          <div className="px-6 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-white text-2xl font-black text-slate-300 shadow-sm ring-1 ring-slate-100 transition group-hover:text-cyan-700">
              +
            </div>
            <p className="mt-4 text-sm font-black text-slate-950">
              Subir imagen
            </p>
            <p className="mt-2 text-xs font-bold leading-5 text-slate-400">
              JPG, PNG o WEBP. Usa fotos verticales de la misma sesión.
            </p>
          </div>
        )}

        <input
          id={id}
          type="file"
          accept="image/png,image/jpeg,image/jpg,image/webp"
          className="hidden"
          onChange={(event) => {
            const selectedFile = event.target.files?.[0] || null;
            onChange(selectedFile);
          }}
        />
      </label>

      {file ? (
        <p className="mt-3 truncate text-xs font-bold text-slate-400">
          {file.name}
        </p>
      ) : null}
    </div>
  );
}

function StatCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_60px_rgba(15,23,42,0.04)]">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
        {label}
      </p>
      <p className="mt-3 text-2xl font-black tracking-[-0.05em] text-slate-950">
        {value}
      </p>
      <p className="mt-2 text-xs font-bold leading-5 text-slate-400">
        {helper}
      </p>
    </div>
  );
}

export default function CatalogAIPage() {
  const [brandSlug, setBrandSlug] = useState("");
  const [batchName, setBatchName] = useState("Nuevo lote de catálogo");

  const [selectedPreset, setSelectedPreset] =
    useState<PresetKey>("short-detail");
  const [promptText, setPromptText] = useState(DEFAULT_PROMPT);

  const [imageA, setImageA] = useState<File | null>(null);
  const [imageB, setImageB] = useState<File | null>(null);
  const [previewA, setPreviewA] = useState("");
  const [previewB, setPreviewB] = useState("");

  const [status, setStatus] = useState<GenerationStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [outputImageUrl, setOutputImageUrl] = useState("");
  const [sentPrompt, setSentPrompt] = useState("");
  const [requestId, setRequestId] = useState("");
  const [usageText, setUsageText] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const queryBrandName = params.get("brandName") || "";
    const nextBrandSlug = slugifyBrand(queryBrandName) || getStoredBrandSlug();

    setBrandSlug(nextBrandSlug);

    if (nextBrandSlug) {
      setBatchName(`Catálogo ${nextBrandSlug}`);
    }
  }, []);

  useEffect(() => createPreviewUrl(imageA, setPreviewA), [imageA]);
  useEffect(() => createPreviewUrl(imageB, setPreviewB), [imageB]);

  const canGenerate = useMemo(
    () => Boolean(imageA && imageB && status !== "generating"),
    [imageA, imageB, status],
  );

  function resetResult() {
    setStatus("idle");
    setErrorMessage("");
    setOutputImageUrl("");
    setRequestId("");
    setUsageText("");
    setSentPrompt("");
  }

  function applyPreset(presetKey: PresetKey) {
    const preset = PRESETS.find((item) => item.key === presetKey);

    if (!preset) return;

    setSelectedPreset(preset.key);
    setPromptText(preset.prompt);
    resetResult();
  }

  async function handleGenerate() {
    if (!imageA || !imageB) {
      setStatus("error");
      setErrorMessage("Sube las dos imágenes antes de generar.");
      return;
    }

    setStatus("generating");
    setErrorMessage("");
    setOutputImageUrl("");
    setRequestId("");
    setUsageText("");
    setSentPrompt("");

    try {
      const formData = new FormData();

      formData.append("imageA", imageA);
      formData.append("imageB", imageB);
      formData.append("brandSlug", brandSlug);
      formData.append("batchName", batchName);
      formData.append("prompt", promptText);

      const response = await fetch("/api/catalog-ai/generate", {
        method: "POST",
        body: formData,
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "No se pudo generar la imagen. Revisa la terminal del servidor.",
        );
      }

      const generatedUrl =
        data?.outputImageUrl || data?.imageUrl || data?.url || "";

      if (!generatedUrl) {
        throw new Error(
          "La API respondió correctamente, pero no regresó una imagen.",
        );
      }

      setOutputImageUrl(generatedUrl);
      setRequestId(data?.requestId || "");
      setSentPrompt(data?.sentPrompt || promptText);

      if (data?.usage?.total_tokens) {
        setUsageText(`${data.usage.total_tokens} tokens`);
      } else if (data?.usage) {
        setUsageText("Uso registrado");
      }

      setStatus("done");
    } catch (error) {
      setStatus("error");
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "No se pudo generar la imagen de catálogo.",
      );
    }
  }

  async function handleDownloadFinal() {
    if (!outputImageUrl) return;

    try {
      const finalImage = await cropDataUrlTo1080x1350(outputImageUrl);
      const cleanName = slugifyBrand(batchName || brandSlug || "catalog-ai");

      downloadDataUrl(
        finalImage,
        `${cleanName || "catalog-ai"}-1080x1350.png`,
      );
    } catch (error) {
      setStatus("error");
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "No se pudo descargar la imagen final.",
      );
    }
  }

  function handleDownloadOriginal() {
    if (!outputImageUrl) return;

    const cleanName = slugifyBrand(batchName || brandSlug || "catalog-ai");

    downloadDataUrl(
      outputImageUrl,
      `${cleanName || "catalog-ai"}-api-original.png`,
    );
  }

  const statusLabel =
    status === "done"
      ? "Listo"
      : status === "error"
        ? "Error"
        : status === "generating"
          ? "Generando"
          : "Pendiente";

  return (
    <main className="min-h-screen bg-slate-50 pl-72">
      <div className="mx-auto max-w-[1560px] px-8 py-8">
        <section className="overflow-hidden rounded-[44px] border border-slate-200 bg-white shadow-[0_24px_90px_rgba(15,23,42,0.06)]">
          <div className="relative overflow-hidden bg-slate-950 px-8 py-9 text-white">
            <div className="absolute right-[-120px] top-[-160px] h-96 w-96 rounded-full bg-cyan-400/20 blur-3xl" />
            <div className="absolute bottom-[-180px] right-[220px] h-96 w-96 rounded-full bg-emerald-400/20 blur-3xl" />
            <div className="absolute left-[40%] top-[-220px] h-80 w-80 rounded-full bg-violet-400/10 blur-3xl" />

            <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <div className="inline-flex rounded-full bg-white/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-200 ring-1 ring-white/10">
                  Catalog AI / ChatGPT Style
                </div>

                <h1 className="mt-5 max-w-5xl text-5xl font-black tracking-[-0.07em] text-white">
                  Imágenes de catálogo con tu prompt ganador
                </h1>

                <p className="mt-4 max-w-3xl text-sm font-semibold leading-7 text-slate-300">
                  Sube dos fotos, usa el prompt que ya te funciona y genera una
                  imagen premium 1080x1350 para catálogo, feed o anuncios.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-[28px] bg-white/10 p-4 ring-1 ring-white/10">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-300">
                    Motor
                  </p>
                  <p className="mt-2 text-xl font-black tracking-[-0.04em] text-white">
                    OpenAI API
                  </p>
                  <p className="mt-1 text-xs font-bold text-cyan-200">
                    Edición con imágenes de referencia
                  </p>
                </div>

                <div className="rounded-[28px] bg-white/10 p-4 ring-1 ring-white/10">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-300">
                    Preset
                  </p>
                  <p className="mt-2 text-xl font-black tracking-[-0.04em] text-white">
                    Short + detalle
                  </p>
                  <p className="mt-1 text-xs font-bold text-cyan-200">
                    El flujo que usas conmigo
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 border-b border-slate-200 bg-slate-50 p-5 lg:grid-cols-4">
            <StatCard
              label="Flujo"
              value="2 → 1"
              helper="Dos fotos en una pieza comercial."
            />
            <StatCard
              label="Formato"
              value="4:5"
              helper="Descarga final 1080x1350."
            />
            <StatCard
              label="Prompt"
              value="Real"
              helper="Usa la instrucción que ya funcionó."
            />
            <StatCard
              label="Uso"
              value="API"
              helper="Sin depender del límite de ChatGPT."
            />
          </div>
        </section>

        <section className="mt-8 grid gap-8 xl:grid-cols-[1.06fr_0.94fr]">
          <div className="space-y-8">
            <div className="rounded-[38px] border border-slate-200 bg-white p-6 shadow-[0_20px_80px_rgba(15,23,42,0.05)]">
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-700">
                    Nuevo lote
                  </p>
                  <h2 className="mt-2 text-2xl font-black tracking-[-0.05em] text-slate-950">
                    Crear imagen de catálogo
                  </h2>
                  <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
                    Aquí no usamos sliders raros ni recorte manual. Solo subes
                    fotos, eliges preset y generas con API.
                  </p>
                </div>

                <div className="rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-slate-100">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                    Marca activa
                  </p>
                  <p className="mt-1 text-sm font-black text-slate-950">
                    {brandSlug || "Sin marca seleccionada"}
                  </p>
                </div>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">
                    Nombre del lote
                  </label>
                  <input
                    value={batchName}
                    onChange={(event) => setBatchName(event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-950 outline-none transition placeholder:text-slate-300 focus:border-cyan-300 focus:bg-white focus:ring-4 focus:ring-cyan-100"
                    placeholder="Ej. Shorts negros semana 27"
                  />
                </div>

                <div>
                  <label className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">
                    Salida final
                  </label>
                  <div className="mt-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-sm font-black text-slate-950">
                      1080 x 1350 px
                    </p>
                    <p className="mt-1 text-xs font-bold text-slate-400">
                      Vertical 4:5 para catálogo, feed y anuncios.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <UploadCard
                id="catalog-image-a"
                title="Foto 1"
                subtitle="Primera foto de referencia."
                file={imageA}
                previewUrl={previewA}
                onChange={(file) => {
                  setImageA(file);
                  resetResult();
                }}
                onRemove={() => {
                  setImageA(null);
                  resetResult();
                }}
              />

              <UploadCard
                id="catalog-image-b"
                title="Foto 2"
                subtitle="Segunda foto de referencia."
                file={imageB}
                previewUrl={previewB}
                onChange={(file) => {
                  setImageB(file);
                  resetResult();
                }}
                onRemove={() => {
                  setImageB(null);
                  resetResult();
                }}
              />
            </div>

            <div className="rounded-[38px] border border-slate-200 bg-white p-6 shadow-[0_20px_80px_rgba(15,23,42,0.05)]">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-700">
                  Prompt Studio
                </p>
                <h2 className="mt-2 text-2xl font-black tracking-[-0.05em] text-slate-950">
                  Preset de edición
                </h2>
              </div>

              <div className="mt-6 grid gap-3 md:grid-cols-2">
                {PRESETS.map((preset) => (
                  <button
                    key={preset.key}
                    type="button"
                    onClick={() => applyPreset(preset.key)}
                    className={`rounded-[24px] border p-4 text-left transition ${
                      selectedPreset === preset.key
                        ? "border-cyan-300 bg-cyan-50 ring-4 ring-cyan-100"
                        : "border-slate-200 bg-slate-50 hover:bg-white"
                    }`}
                  >
                    <p className="text-sm font-black text-slate-950">
                      {preset.name}
                    </p>
                    <p className="mt-1 text-xs font-bold leading-5 text-slate-400">
                      {preset.subtitle}
                    </p>
                  </button>
                ))}
              </div>

              <div className="mt-6">
                <label className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">
                  Prompt enviado a la API
                </label>

                <textarea
                  value={promptText}
                  onChange={(event) => {
                    setPromptText(event.target.value);
                    setSelectedPreset("free");
                    resetResult();
                  }}
                  rows={7}
                  className="mt-3 w-full resize-none rounded-[26px] border border-slate-200 bg-slate-950 px-5 py-4 text-sm font-semibold leading-7 text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100"
                />
              </div>

              <div className="mt-5 rounded-[26px] border border-emerald-200 bg-emerald-50 p-5">
                <p className="text-sm font-black text-emerald-800">
                  Modo recomendado
                </p>
                <p className="mt-2 text-xs font-bold leading-5 text-emerald-700">
                  Para el resultado que buscas, deja el preset “Short + detalle”.
                  Es tu prompt original más una protección mínima para evitar
                  línea divisoria o collage separado.
                </p>
              </div>
            </div>
          </div>

          <aside className="space-y-8">
            <div className="sticky top-8 space-y-8">
              <div className="rounded-[38px] border border-slate-200 bg-white p-6 shadow-[0_20px_80px_rgba(15,23,42,0.05)]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-700">
                      Resultado
                    </p>
                    <h2 className="mt-2 text-2xl font-black tracking-[-0.05em] text-slate-950">
                      Imagen generada
                    </h2>
                  </div>

                  <div
                    className={`rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] ${
                      status === "done"
                        ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
                        : status === "error"
                          ? "bg-rose-50 text-rose-700 ring-1 ring-rose-100"
                          : status === "generating"
                            ? "bg-cyan-50 text-cyan-700 ring-1 ring-cyan-100"
                            : "bg-slate-100 text-slate-500 ring-1 ring-slate-200"
                    }`}
                  >
                    {statusLabel}
                  </div>
                </div>

                <div className="mt-5 flex min-h-[700px] items-center justify-center overflow-hidden rounded-[32px] border border-slate-200 bg-slate-50">
                  {status === "generating" ? (
                    <div className="px-8 text-center">
                      <div className="mx-auto h-16 w-16 animate-pulse rounded-full bg-cyan-300 shadow-[0_0_45px_rgba(34,211,238,0.45)]" />
                      <p className="mt-5 text-sm font-black text-slate-950">
                        Generando imagen con API...
                      </p>
                      <p className="mt-2 text-xs font-bold leading-5 text-slate-400">
                        Usando el prompt estilo ChatGPT que ya te funciona.
                      </p>
                    </div>
                  ) : outputImageUrl ? (
                    <img
                      src={outputImageUrl}
                      alt="Imagen generada"
                      className="h-full max-h-[840px] w-full object-contain"
                    />
                  ) : (
                    <div className="px-8 text-center">
                      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-white text-xl font-black text-slate-300 shadow-sm ring-1 ring-slate-100">
                        CA
                      </div>
                      <p className="mt-5 text-sm font-black text-slate-950">
                        Aquí aparecerá el resultado
                      </p>
                      <p className="mt-2 text-xs font-bold leading-5 text-slate-400">
                        Sube ambas fotos y genera la imagen de catálogo.
                      </p>
                    </div>
                  )}
                </div>

                {errorMessage ? (
                  <div className="mt-4 rounded-[24px] border border-rose-200 bg-rose-50 p-4">
                    <p className="text-sm font-black text-rose-700">
                      No se pudo generar
                    </p>
                    <p className="mt-1 text-xs font-bold leading-5 text-rose-500">
                      {errorMessage}
                    </p>
                  </div>
                ) : null}

                {requestId || usageText ? (
                  <div className="mt-4 rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                      Registro API
                    </p>

                    {requestId ? (
                      <p className="mt-2 break-all text-xs font-bold text-slate-500">
                        Request ID: {requestId}
                      </p>
                    ) : null}

                    {usageText ? (
                      <p className="mt-1 text-xs font-bold text-slate-500">
                        Uso: {usageText}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                <div className="mt-5 grid gap-3">
                  <button
                    type="button"
                    onClick={handleGenerate}
                    disabled={!canGenerate}
                    className="rounded-[24px] bg-slate-950 px-5 py-4 text-sm font-black text-white shadow-[0_18px_45px_rgba(15,23,42,0.18)] transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
                  >
                    {status === "generating"
                      ? "Generando..."
                      : outputImageUrl
                        ? "Regenerar con este prompt"
                        : "Generar imagen de catálogo"}
                  </button>

                  {outputImageUrl ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={handleDownloadFinal}
                        className="rounded-[24px] bg-cyan-50 px-5 py-4 text-center text-sm font-black text-cyan-700 ring-1 ring-cyan-100 transition hover:bg-cyan-100"
                      >
                        Descargar 1080x1350
                      </button>

                      <button
                        type="button"
                        onClick={handleDownloadOriginal}
                        className="rounded-[24px] bg-slate-50 px-5 py-4 text-center text-sm font-black text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-100"
                      >
                        Descargar original API
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>

              {sentPrompt ? (
                <div className="rounded-[38px] border border-slate-200 bg-white p-6 shadow-[0_20px_80px_rgba(15,23,42,0.05)]">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                    Último prompt enviado
                  </p>

                  <div className="mt-4 max-h-[360px] overflow-y-auto rounded-[26px] bg-slate-950 p-5">
                    <pre className="whitespace-pre-wrap text-xs font-semibold leading-6 text-slate-200">
                      {sentPrompt}
                    </pre>
                  </div>
                </div>
              ) : null}
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}