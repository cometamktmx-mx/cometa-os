import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * La generación de imágenes puede superar los 120 segundos.
 * Vercel permitirá que esta función trabaje hasta 300 segundos.
 */
export const maxDuration = 300;

const OPENAI_IMAGE_EDIT_URL = "https://api.openai.com/v1/images/edits";

/**
 * Detenemos la llamada unos segundos antes del límite de Vercel
 * para poder devolver un error entendible en lugar de que Vercel
 * termine abruptamente la función.
 */
const OPENAI_REQUEST_TIMEOUT_MS = 280_000;

const MAX_IMAGE_SIZE_MB = 25;
const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
]);

const ALLOWED_IMAGE_QUALITIES = new Set(["low", "medium", "high"]);

function getStringValue(
  formData: FormData,
  key: string,
  fallback = "",
): string {
  const value = formData.get(key);

  if (typeof value !== "string") {
    return fallback;
  }

  return value.trim();
}

function isFile(value: FormDataEntryValue | null): value is File {
  return (
    typeof value === "object" &&
    value !== null &&
    "arrayBuffer" in value &&
    "name" in value &&
    "size" in value &&
    "type" in value
  );
}

function sanitizeFilename(filename: string, fallback: string): string {
  const cleanName = String(filename || fallback)
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  return cleanName || fallback;
}

function validateImageFile(file: File, label: string): void {
  if (!file || file.size <= 0) {
    throw new Error(`${label} está vacía o no se pudo leer.`);
  }

  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    throw new Error(
      `${label} pesa más de ${MAX_IMAGE_SIZE_MB}MB. Usa una imagen más ligera.`,
    );
  }

  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new Error(
      `${label} debe ser PNG, JPG, JPEG o WEBP. Tipo recibido: ${
        file.type || "desconocido"
      }.`,
    );
  }
}

function getOpenAIErrorMessage(rawText: string): string {
  try {
    const parsed = JSON.parse(rawText);

    return (
      parsed?.error?.message ||
      parsed?.message ||
      "OpenAI no pudo generar la imagen."
    );
  } catch {
    return rawText || "OpenAI no pudo generar la imagen.";
  }
}

function getImageQuality(): string {
  const configuredQuality = (
    process.env.OPENAI_IMAGE_QUALITY || "high"
  ).toLowerCase();

  if (ALLOWED_IMAGE_QUALITIES.has(configuredQuality)) {
    return configuredQuality;
  }

  return "high";
}

async function appendImageToOpenAIForm({
  openAIFormData,
  file,
  fallbackName,
}: {
  openAIFormData: FormData;
  file: File;
  fallbackName: string;
}): Promise<void> {
  const arrayBuffer = await file.arrayBuffer();

  const blob = new Blob([arrayBuffer], {
    type: file.type || "image/png",
  });

  const filename = sanitizeFilename(file.name, fallbackName);

  openAIFormData.append("image[]", blob, filename);
}

function buildFinalPrompt(prompt: string): string {
  const cleanPrompt = prompt.trim();

  const fallbackPrompt =
    "Haz una imagen de 1080x1350px juntando ambas fotos, en fondo blanco claro de estudio, ambas fotos en un mismo fondo, sin modificar la ropa, no cambies el color de la ropa. La idea es enfocar el short, recorta la cabeza y enfoca únicamente el short y sus detalles.";

  const mainPrompt = cleanPrompt || fallbackPrompt;

  return `${mainPrompt}

INSTRUCCIONES OBLIGATORIAS:
- Utiliza las dos fotografías proporcionadas como referencias.
- Conserva fielmente la prenda, su forma, textura, costuras, diseño y color.
- No cambies el cuerpo ni las características importantes del producto.
- Crea una sola composición fotográfica vertical con proporción 4:5.
- Utiliza un fondo blanco claro, limpio y uniforme de estudio profesional.
- Evita que parezca un collage dividido.
- No agregues línea vertical, separador, marco, borde, paneles ni divisiones.
- Las dos vistas deben integrarse naturalmente dentro de una sola fotografía.
- No agregues texto, logotipos, etiquetas, accesorios ni prendas nuevas.
- El resultado debe verse limpio, comercial, realista y premium.`;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();

  try {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Falta configurar OPENAI_API_KEY en .env.local o en las variables de Vercel.",
        },
        {
          status: 500,
          headers: {
            "Cache-Control": "no-store",
          },
        },
      );
    }

    console.info("[Catalog AI] Recibiendo solicitud de generación.");

    const formData = await request.formData();

    const imageA = formData.get("imageA");
    const imageB = formData.get("imageB");

    if (!isFile(imageA) || !isFile(imageB)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Debes enviar imageA e imageB como archivos.",
        },
        {
          status: 400,
          headers: {
            "Cache-Control": "no-store",
          },
        },
      );
    }

    validateImageFile(imageA, "Foto 1");
    validateImageFile(imageB, "Foto 2");

    const brandSlug = getStringValue(formData, "brandSlug");
    const batchName = getStringValue(
      formData,
      "batchName",
      "Catalog AI",
    );
    const userPrompt = getStringValue(formData, "prompt");

    const imageModel =
      process.env.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-2";

    const imageQuality = getImageQuality();

    const isGptImage2 = imageModel.startsWith("gpt-image-2");

    const imageSize =
      process.env.OPENAI_IMAGE_SIZE?.trim() ||
      (isGptImage2 ? "1088x1360" : "1024x1536");

    const prompt = buildFinalPrompt(userPrompt);

    console.info("[Catalog AI] Preparando solicitud para OpenAI.", {
      model: imageModel,
      quality: imageQuality,
      size: imageSize,
      imageASizeBytes: imageA.size,
      imageBSizeBytes: imageB.size,
      brandSlug,
      batchName,
    });

    const openAIFormData = new FormData();

    openAIFormData.append("model", imageModel);
    openAIFormData.append("prompt", prompt);
    openAIFormData.append("quality", imageQuality);
    openAIFormData.append("output_format", "png");
    openAIFormData.append("background", "auto");
    openAIFormData.append("moderation", "auto");
    openAIFormData.append("size", imageSize);

    /**
     * gpt-image-2 ya procesa automáticamente las referencias
     * con alta fidelidad. Para modelos anteriores sí enviamos
     * explícitamente input_fidelity.
     */
    if (!isGptImage2) {
      openAIFormData.append("input_fidelity", "high");
    }

    await appendImageToOpenAIForm({
      openAIFormData,
      file: imageA,
      fallbackName: "catalog-image-1.png",
    });

    await appendImageToOpenAIForm({
      openAIFormData,
      file: imageB,
      fallbackName: "catalog-image-2.png",
    });

    const abortController = new AbortController();

    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, OPENAI_REQUEST_TIMEOUT_MS);

    let openAIResponse: Response;

    try {
      console.info("[Catalog AI] Iniciando generación con OpenAI.");

      openAIResponse = await fetch(OPENAI_IMAGE_EDIT_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: openAIFormData,
        signal: abortController.signal,
        cache: "no-store",
      });
    } finally {
      clearTimeout(timeoutId);
    }

    const openAIDurationMs = Date.now() - startedAt;

    const requestId =
      openAIResponse.headers.get("x-request-id") || "";

    console.info("[Catalog AI] OpenAI respondió.", {
      status: openAIResponse.status,
      requestId,
      durationMs: openAIDurationMs,
    });

    const responseText = await openAIResponse.text();

    if (!openAIResponse.ok) {
      const message = getOpenAIErrorMessage(responseText);

      console.error("[Catalog AI] OpenAI rechazó la solicitud.", {
        status: openAIResponse.status,
        requestId,
        message,
        durationMs: Date.now() - startedAt,
      });

      return NextResponse.json(
        {
          ok: false,
          error: message,
          requestId,
          durationMs: Date.now() - startedAt,
        },
        {
          status: openAIResponse.status,
          headers: {
            "Cache-Control": "no-store",
          },
        },
      );
    }

    let data: {
      data?: Array<{
        b64_json?: string;
      }>;
      usage?: unknown;
    };

    try {
      data = JSON.parse(responseText);
    } catch {
      console.error(
        "[Catalog AI] OpenAI respondió con un formato JSON inválido.",
        {
          requestId,
          responseLength: responseText.length,
        },
      );

      return NextResponse.json(
        {
          ok: false,
          error:
            "OpenAI respondió, pero el servidor no pudo interpretar el resultado.",
          requestId,
          durationMs: Date.now() - startedAt,
        },
        {
          status: 502,
          headers: {
            "Cache-Control": "no-store",
          },
        },
      );
    }

    const b64Image = data?.data?.[0]?.b64_json || "";

    if (!b64Image) {
      console.error(
        "[Catalog AI] OpenAI no regresó una imagen en b64_json.",
        {
          requestId,
          durationMs: Date.now() - startedAt,
        },
      );

      return NextResponse.json(
        {
          ok: false,
          error:
            "OpenAI respondió correctamente, pero no regresó la imagen generada.",
          requestId,
          durationMs: Date.now() - startedAt,
        },
        {
          status: 502,
          headers: {
            "Cache-Control": "no-store",
          },
        },
      );
    }

    const outputImageUrl = `data:image/png;base64,${b64Image}`;
    const durationMs = Date.now() - startedAt;

    console.info("[Catalog AI] Imagen generada correctamente.", {
      requestId,
      model: imageModel,
      quality: imageQuality,
      size: imageSize,
      durationMs,
      outputBase64Length: b64Image.length,
    });

    return NextResponse.json(
      {
        ok: true,
        outputImageUrl,
        imageUrl: outputImageUrl,
        brandSlug,
        batchName,
        model: imageModel,
        quality: imageQuality,
        size: imageSize,
        requestId,
        usage: data?.usage || null,
        sentPrompt: prompt,
        durationMs,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    const durationMs = Date.now() - startedAt;

    if (isAbortError(error)) {
      console.error(
        "[Catalog AI] La generación superó el tiempo interno permitido.",
        {
          durationMs,
        },
      );

      return NextResponse.json(
        {
          ok: false,
          error:
            "La imagen tardó demasiado en generarse. Inténtalo nuevamente o cambia temporalmente la calidad a medium.",
          code: "OPENAI_IMAGE_TIMEOUT",
          durationMs,
        },
        {
          status: 504,
          headers: {
            "Cache-Control": "no-store",
          },
        },
      );
    }

    console.error("[Catalog AI] Error al generar la imagen:", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudo generar la imagen de catálogo.",
        durationMs,
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }
}