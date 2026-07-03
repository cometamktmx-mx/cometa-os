import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

const OPENAI_IMAGE_EDIT_URL = "https://api.openai.com/v1/images/edits";

const MAX_IMAGE_SIZE_MB = 25;
const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
]);

function getStringValue(formData: FormData, key: string, fallback = "") {
  const value = formData.get(key);

  if (typeof value !== "string") return fallback;

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

function sanitizeFilename(filename: string, fallback: string) {
  const cleanName = String(filename || fallback)
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  return cleanName || fallback;
}

function validateImageFile(file: File, label: string) {
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

function getOpenAIErrorMessage(rawText: string) {
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

async function appendImageToOpenAIForm({
  openAIFormData,
  file,
  fallbackName,
}: {
  openAIFormData: FormData;
  file: File;
  fallbackName: string;
}) {
  const arrayBuffer = await file.arrayBuffer();

  const blob = new Blob([arrayBuffer], {
    type: file.type || "image/png",
  });

  const filename = sanitizeFilename(file.name, fallbackName);

  openAIFormData.append("image[]", blob, filename);
}

function buildFinalPrompt(prompt: string) {
  const cleanPrompt = prompt.trim();

  const fallbackPrompt =
    "haz una imagen de 1080x1350px juntando ambas fotos, en fondo blanco claro de estudio, ambas fotos en un mismo fondo, sin modificar la ropa, no cambies el color de la ropa, la idea es enfocar el short, recorta la cabeza, solo enfoca al short y al detalle.";

  const mainPrompt = cleanPrompt || fallbackPrompt;

  return `${mainPrompt}

Evita que parezca collage dividido. No agregues línea vertical, separador, marco, borde, paneles ni división entre las dos fotos. Debe verse como una sola fotografía de estudio limpia y premium. Mantén la ropa y los colores originales.`;
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Falta configurar OPENAI_API_KEY en .env.local o en las variables de Vercel.",
        },
        { status: 500 },
      );
    }

    const formData = await request.formData();

    const imageA = formData.get("imageA");
    const imageB = formData.get("imageB");

    if (!isFile(imageA) || !isFile(imageB)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Debes enviar imageA e imageB como archivos.",
        },
        { status: 400 },
      );
    }

    validateImageFile(imageA, "Foto 1");
    validateImageFile(imageB, "Foto 2");

    const brandSlug = getStringValue(formData, "brandSlug");
    const batchName = getStringValue(formData, "batchName", "Catalog AI");
    const userPrompt = getStringValue(formData, "prompt");

    const imageModel = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2";
    const prompt = buildFinalPrompt(userPrompt);

    const openAIFormData = new FormData();

    openAIFormData.append("model", imageModel);
    openAIFormData.append("prompt", prompt);
    openAIFormData.append("quality", "high");
    openAIFormData.append("output_format", "png");
    openAIFormData.append("background", "auto");
    openAIFormData.append("moderation", "auto");

    if (imageModel.startsWith("gpt-image-2")) {
      openAIFormData.append("size", "1088x1360");
    } else {
      openAIFormData.append("size", "1024x1536");
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

    const openAIResponse = await fetch(OPENAI_IMAGE_EDIT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: openAIFormData,
    });

    const requestId = openAIResponse.headers.get("x-request-id") || "";
    const responseText = await openAIResponse.text();

    if (!openAIResponse.ok) {
      const message = getOpenAIErrorMessage(responseText);

      return NextResponse.json(
        {
          ok: false,
          error: message,
          requestId,
        },
        { status: openAIResponse.status },
      );
    }

    const data = JSON.parse(responseText);
    const b64Image = data?.data?.[0]?.b64_json || "";

    if (!b64Image) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "OpenAI respondió correctamente, pero no regresó b64_json de imagen.",
          requestId,
          raw: data,
        },
        { status: 502 },
      );
    }

    const outputImageUrl = `data:image/png;base64,${b64Image}`;

    return NextResponse.json({
      ok: true,
      outputImageUrl,
      imageUrl: outputImageUrl,
      brandSlug,
      batchName,
      model: imageModel,
      requestId,
      usage: data?.usage || null,
      sentPrompt: prompt,
    });
  } catch (error) {
    console.error("Catalog AI generate error:", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudo generar la imagen de catálogo.",
      },
      { status: 500 },
    );
  }
}