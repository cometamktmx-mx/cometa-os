import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

const OPENAI_IMAGE_EDIT_URL = "https://api.openai.com/v1/images/edits";

/**
 * Dejamos margen antes de los 300 segundos de Vercel
 * para poder responder con un error controlado.
 */
const OPENAI_REQUEST_TIMEOUT_MS = 275_000;

const MAX_IMAGE_SIZE_MB = 25;
const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
]);

type ImageQuality = "low" | "medium" | "high" | "auto";
type ImageModeration = "low" | "auto";
type ImageOutputFormat = "png" | "jpeg" | "webp";

type OpenAIParsedError = {
  message: string;
  code: string;
  type: string;
  moderationStage: string;
  categories: string[];
};

type OpenAIImageResponse = {
  data?: Array<{
    b64_json?: string;
  }>;
  usage?: unknown;
  output_format?: string;
  quality?: string;
  size?: string;
};

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

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

function isFile(
  value: FormDataEntryValue | null,
): value is File {
  return (
    typeof value === "object" &&
    value !== null &&
    "arrayBuffer" in value &&
    "name" in value &&
    "size" in value &&
    "type" in value
  );
}

function sanitizeFilename(
  filename: string,
  fallback: string,
): string {
  const cleanName = String(filename || fallback)
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  return cleanName || fallback;
}

function validateImageFile(
  file: File,
  label: string,
): void {
  if (!file || file.size <= 0) {
    throw new Error(
      `${label} está vacía o no se pudo leer.`,
    );
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

function asRecord(
  value: unknown,
): Record<string, unknown> {
  if (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  ) {
    return value as Record<string, unknown>;
  }

  return {};
}

function parseOpenAIError(
  rawText: string,
): OpenAIParsedError {
  try {
    const parsed = asRecord(JSON.parse(rawText));
    const errorObject = asRecord(parsed.error);
    const moderationDetails = asRecord(
      errorObject.moderation_details,
    );

    const rawCategories = moderationDetails.categories;

    const categories = Array.isArray(rawCategories)
      ? rawCategories.filter(
          (category): category is string =>
            typeof category === "string",
        )
      : [];

    const messageValue =
      errorObject.message || parsed.message;

    return {
      message:
        typeof messageValue === "string" &&
        messageValue.trim()
          ? messageValue
          : "OpenAI no pudo generar la imagen.",
      code:
        typeof errorObject.code === "string"
          ? errorObject.code
          : "",
      type:
        typeof errorObject.type === "string"
          ? errorObject.type
          : "",
      moderationStage:
        typeof moderationDetails.moderation_stage ===
        "string"
          ? moderationDetails.moderation_stage
          : "",
      categories,
    };
  } catch {
    return {
      message:
        rawText.trim() ||
        "OpenAI no pudo generar la imagen.",
      code: "",
      type: "",
      moderationStage: "",
      categories: [],
    };
  }
}

function getImageQuality(): ImageQuality {
  const configuredValue =
    process.env.OPENAI_IMAGE_QUALITY?.trim().toLowerCase();

  if (
    configuredValue === "low" ||
    configuredValue === "medium" ||
    configuredValue === "high" ||
    configuredValue === "auto"
  ) {
    return configuredValue;
  }

  return "high";
}

function getImageModeration(): ImageModeration {
  const configuredValue =
    process.env.OPENAI_IMAGE_MODERATION
      ?.trim()
      .toLowerCase();

  if (configuredValue === "auto") {
    return "auto";
  }

  /**
   * Menos restrictivo para reducir falsos positivos
   * en fotografía comercial legítima de moda.
   */
  return "low";
}

function getOutputFormat(): ImageOutputFormat {
  const configuredValue =
    process.env.OPENAI_IMAGE_OUTPUT_FORMAT
      ?.trim()
      .toLowerCase();

  if (
    configuredValue === "jpeg" ||
    configuredValue === "webp" ||
    configuredValue === "png"
  ) {
    return configuredValue;
  }

  return "png";
}

function getMimeType(
  outputFormat: ImageOutputFormat,
): string {
  if (outputFormat === "jpeg") {
    return "image/jpeg";
  }

  if (outputFormat === "webp") {
    return "image/webp";
  }

  return "image/png";
}

function isGptImage2Model(
  imageModel: string,
): boolean {
  return (
    imageModel === "gpt-image-2" ||
    imageModel.startsWith("gpt-image-2-")
  );
}

function supportsInputFidelity(
  imageModel: string,
): boolean {
  if (isGptImage2Model(imageModel)) {
    return false;
  }

  if (imageModel.includes("mini")) {
    return false;
  }

  return (
    imageModel === "gpt-image-1" ||
    imageModel.startsWith("gpt-image-1-") ||
    imageModel.startsWith("gpt-image-1.5") ||
    imageModel === "chatgpt-image-latest"
  );
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

  const filename = sanitizeFilename(
    file.name,
    fallbackName,
  );

  openAIFormData.append(
    "image[]",
    blob,
    filename,
  );
}

/**
 * Convierte instrucciones comunes de fotografía de moda
 * en expresiones más neutrales de ecommerce.
 *
 * La moderación sigue activa. Esto solamente ayuda a
 * reducir falsos positivos por frases ambiguas.
 */
function normalizeCatalogPrompt(
  userPrompt: string,
): string {
  let normalizedPrompt = userPrompt
    .replace(/\s+/g, " ")
    .trim();

  const replacements: Array<[RegExp, string]> = [
    [
      /\brecort(?:a|ar)\s+(?:la\s+)?cabeza\b/gi,
      "deja el rostro naturalmente fuera del encuadre",
    ],
    [
      /\b(?:quita|quitar|elimina|eliminar)\s+(?:la\s+)?cabeza\b/gi,
      "deja el rostro naturalmente fuera del encuadre",
    ],
    [
      /\bsin\s+(?:mostrar\s+)?(?:la\s+)?cabeza\b/gi,
      "sin mostrar el rostro",
    ],
    [
      /\bsolamente\s+el\s+cuerpo\b/gi,
      "presentación centrada en la prenda",
    ],
    [
      /\bsolo\s+el\s+cuerpo\b/gi,
      "presentación centrada en la prenda",
    ],
    [
      /\benfoca(?:r)?\s+(?:los\s+)?gl[uú]teos\b/gi,
      "destaca la vista posterior de la prenda",
    ],
    [
      /\benfoca(?:r)?\s+(?:las\s+)?nalgas\b/gi,
      "destaca la vista posterior de la prenda",
    ],
    [
      /\benfoca(?:r)?\s+(?:el\s+)?trasero\b/gi,
      "destaca la vista posterior de la prenda",
    ],
    [
      /\bgl[uú]teos\b/gi,
      "parte posterior de la prenda",
    ],
    [
      /\bnalgas\b/gi,
      "parte posterior de la prenda",
    ],
    [
      /\btrasero\b/gi,
      "parte posterior de la prenda",
    ],
    [
      /\benfoca(?:r)?\s+(?:el\s+)?pecho\b/gi,
      "destaca la parte frontal de la prenda superior",
    ],
    [
      /\benfoca(?:r)?\s+(?:los\s+)?senos\b/gi,
      "destaca la parte frontal de la prenda superior",
    ],
    [
      /\benfoca(?:r)?\s+(?:el\s+)?busto\b/gi,
      "destaca la parte frontal de la prenda superior",
    ],
    [
      /\bentrepierna\b/gi,
      "zona central de la prenda",
    ],
    [
      /\bsexy\b/gi,
      "elegante y comercial",
    ],
    [
      /\bsensual\b/gi,
      "elegante y comercial",
    ],
    [
      /\bprovocativ[oa]\b/gi,
      "elegante y comercial",
    ],
    [
      /\bshorts\b/gi,
      "pantalones cortos",
    ],
    [
      /\bshort\b/gi,
      "pantalón corto",
    ],
    [
      /\btops\b/gi,
      "prendas superiores",
    ],
    [
      /\btop\b/gi,
      "prenda superior",
    ],
  ];

  for (const [pattern, replacement] of replacements) {
    normalizedPrompt = normalizedPrompt.replace(
      pattern,
      replacement,
    );
  }

  return normalizedPrompt
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 8_000);
}

function buildFinalPrompt(
  userPrompt: string,
): string {
  const normalizedUserPrompt =
    normalizeCatalogPrompt(userPrompt);

  const specificInstructions = normalizedUserPrompt
    ? normalizedUserPrompt
    : "Combina las dos fotografías en una sola composición y muestra claramente la prenda y sus detalles.";

  return `
OBJETIVO

Crea una fotografía comercial profesional para un catálogo de moda y comercio electrónico utilizando las dos fotografías proporcionadas como referencias visuales.

PRODUCTO

La prioridad absoluta es representar fielmente la prenda mostrada en las imágenes de referencia.

Conserva:

- El diseño original.
- El color original.
- La textura de la tela.
- Las costuras.
- Los estampados.
- Los acabados.
- La forma.
- Las proporciones.
- Los detalles visibles.
- La apariencia real del producto.

COMPOSICIÓN

- Genera una sola fotografía vertical con proporción 4:5.
- Integra las dos referencias naturalmente en un mismo escenario.
- Utiliza un fondo blanco claro y uniforme de estudio profesional.
- Usa iluminación limpia y equilibrada para ecommerce.
- Mantén una postura neutral y natural.
- El encuadre debe estar centrado en mostrar la prenda.
- El rostro puede quedar naturalmente fuera del encuadre cuando no sea necesario para mostrar el producto.
- El resultado debe verse como una sesión fotográfica auténtica de una tienda de ropa en línea.

RESTRICCIONES

- No cambies el color de la prenda.
- No modifiques el diseño de la prenda.
- No inventes costuras, estampados, cierres, botones, etiquetas ni detalles.
- No agregues accesorios.
- No agregues prendas nuevas.
- No agregues texto.
- No agregues logotipos.
- No agregues marcas de agua.
- No agregues marcos.
- No agregues bordes.
- No agregues paneles.
- No agregues separadores.
- No agregues líneas divisorias.
- No generes un collage dividido.
- No alteres innecesariamente la apariencia de la persona.
- No uses poses sugerentes.
- Mantén una presentación neutral, profesional y apropiada para ecommerce.

INSTRUCCIONES COMERCIALES ADICIONALES

${specificInstructions}

RESULTADO ESPERADO

Una fotografía de catálogo limpia, realista, profesional, comercial y premium, con la prenda como protagonista y sin alterar sus características originales.
  `.trim();
}

function isAbortError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.name === "AbortError";
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "name" in error
  ) {
    return (
      (error as { name?: unknown }).name ===
      "AbortError"
    );
  }

  return false;
}

function getModerationUserMessage(
  stage: string,
): string {
  if (stage === "input") {
    return "Una de las fotografías o las instrucciones fue interpretada como contenido sensible. Prueba con otra fotografía, un encuadre más neutral o instrucciones centradas en la prenda.";
  }

  if (stage === "output") {
    return "El resultado generado fue bloqueado por una revisión de seguridad. Cambia ligeramente el encuadre o la composición e inténtalo nuevamente.";
  }

  return "La solicitud no pudo completarse debido a una revisión de seguridad. Prueba con fotografías o instrucciones más neutrales y centradas en la prenda.";
}

export async function POST(
  request: NextRequest,
) {
  const startedAt = Date.now();

  try {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return jsonResponse(
        {
          ok: false,
          error:
            "Falta configurar OPENAI_API_KEY en .env.local o en las variables de Vercel.",
        },
        500,
      );
    }

    console.info(
      "[Catalog AI] Solicitud recibida.",
    );

    const formData = await request.formData();

    const imageA = formData.get("imageA");
    const imageB = formData.get("imageB");

    if (!isFile(imageA) || !isFile(imageB)) {
      return jsonResponse(
        {
          ok: false,
          error:
            "Debes enviar imageA e imageB como archivos.",
        },
        400,
      );
    }

    validateImageFile(imageA, "Foto 1");
    validateImageFile(imageB, "Foto 2");

    const brandSlug = getStringValue(
      formData,
      "brandSlug",
    );

    const batchName = getStringValue(
      formData,
      "batchName",
      "Catalog AI",
    );

    const userPrompt = getStringValue(
      formData,
      "prompt",
    );

    const imageModel =
      process.env.OPENAI_IMAGE_MODEL?.trim() ||
      "gpt-image-2";

    const imageQuality = getImageQuality();
    const imageModeration = getImageModeration();
    const outputFormat = getOutputFormat();

    const isGptImage2 =
      isGptImage2Model(imageModel);

    const imageSize =
      process.env.OPENAI_IMAGE_SIZE?.trim() ||
      (isGptImage2
        ? "1088x1360"
        : "1024x1536");

    const finalPrompt =
      buildFinalPrompt(userPrompt);

    console.info(
      "[Catalog AI] Preparando generación.",
      {
        model: imageModel,
        quality: imageQuality,
        moderation: imageModeration,
        outputFormat,
        size: imageSize,
        imageASizeBytes: imageA.size,
        imageBSizeBytes: imageB.size,
        brandSlug,
        batchName,
      },
    );

    const openAIFormData = new FormData();

    openAIFormData.append(
      "model",
      imageModel,
    );

    openAIFormData.append(
      "prompt",
      finalPrompt,
    );

    openAIFormData.append(
      "quality",
      imageQuality,
    );

    openAIFormData.append(
      "moderation",
      imageModeration,
    );

    openAIFormData.append(
      "output_format",
      outputFormat,
    );

    openAIFormData.append(
      "background",
      "auto",
    );

    openAIFormData.append(
      "size",
      imageSize,
    );

    openAIFormData.append(
      "n",
      "1",
    );

    /**
     * GPT Image 2 no admite cambiar input_fidelity.
     * Ya procesa las referencias con alta fidelidad.
     */
    if (supportsInputFidelity(imageModel)) {
      openAIFormData.append(
        "input_fidelity",
        "high",
      );
    }

    /**
     * La compresión solamente aplica para JPEG y WEBP.
     */
    if (
      outputFormat === "jpeg" ||
      outputFormat === "webp"
    ) {
      openAIFormData.append(
        "output_compression",
        "90",
      );
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

    const abortController =
      new AbortController();

    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, OPENAI_REQUEST_TIMEOUT_MS);

    let openAIResponse: Response;

    try {
      console.info(
        "[Catalog AI] Enviando solicitud a OpenAI.",
      );

      openAIResponse = await fetch(
        OPENAI_IMAGE_EDIT_URL,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
          body: openAIFormData,
          signal: abortController.signal,
          cache: "no-store",
        },
      );
    } finally {
      clearTimeout(timeoutId);
    }

    const requestId =
      openAIResponse.headers.get(
        "x-request-id",
      ) || "";

    const responseText =
      await openAIResponse.text();

    console.info(
      "[Catalog AI] OpenAI respondió.",
      {
        status: openAIResponse.status,
        requestId,
        durationMs:
          Date.now() - startedAt,
      },
    );

    if (!openAIResponse.ok) {
      const openAIError =
        parseOpenAIError(responseText);

      console.error(
        "[Catalog AI] OpenAI rechazó la solicitud.",
        {
          status: openAIResponse.status,
          requestId,
          code: openAIError.code,
          type: openAIError.type,
          moderationStage:
            openAIError.moderationStage,
          categories:
            openAIError.categories,
          durationMs:
            Date.now() - startedAt,
        },
      );

      if (
        openAIError.code ===
        "moderation_blocked"
      ) {
        return jsonResponse(
          {
            ok: false,
            error: getModerationUserMessage(
              openAIError.moderationStage,
            ),
            code: openAIError.code,
            moderationStage:
              openAIError.moderationStage,
            categories:
              openAIError.categories,
            requestId,
            durationMs:
              Date.now() - startedAt,
          },
          openAIResponse.status,
        );
      }

      return jsonResponse(
        {
          ok: false,
          error: openAIError.message,
          code: openAIError.code,
          type: openAIError.type,
          requestId,
          durationMs:
            Date.now() - startedAt,
        },
        openAIResponse.status,
      );
    }

    let data: OpenAIImageResponse;

    try {
      data = JSON.parse(
        responseText,
      ) as OpenAIImageResponse;
    } catch {
      console.error(
        "[Catalog AI] OpenAI respondió con JSON inválido.",
        {
          requestId,
          responseLength:
            responseText.length,
          durationMs:
            Date.now() - startedAt,
        },
      );

      return jsonResponse(
        {
          ok: false,
          error:
            "OpenAI respondió, pero el servidor no pudo interpretar el resultado.",
          requestId,
          durationMs:
            Date.now() - startedAt,
        },
        502,
      );
    }

    const b64Image =
      data.data?.[0]?.b64_json || "";

    if (!b64Image) {
      console.error(
        "[Catalog AI] OpenAI no regresó b64_json.",
        {
          requestId,
          durationMs:
            Date.now() - startedAt,
        },
      );

      return jsonResponse(
        {
          ok: false,
          error:
            "OpenAI respondió correctamente, pero no regresó la imagen generada.",
          requestId,
          durationMs:
            Date.now() - startedAt,
        },
        502,
      );
    }

    const mimeType =
      getMimeType(outputFormat);

    const outputImageUrl =
      `data:${mimeType};base64,${b64Image}`;

    const durationMs =
      Date.now() - startedAt;

    console.info(
      "[Catalog AI] Imagen generada correctamente.",
      {
        requestId,
        model: imageModel,
        quality: imageQuality,
        moderation: imageModeration,
        outputFormat,
        size: imageSize,
        durationMs,
        outputBase64Length:
          b64Image.length,
      },
    );

    return jsonResponse(
      {
        ok: true,
        outputImageUrl,
        imageUrl: outputImageUrl,
        brandSlug,
        batchName,
        model: imageModel,
        quality: imageQuality,
        moderation: imageModeration,
        outputFormat,
        size: imageSize,
        requestId,
        usage: data.usage || null,
        sentPrompt: finalPrompt,
        durationMs,
      },
      200,
    );
  } catch (error) {
    const durationMs =
      Date.now() - startedAt;

    if (isAbortError(error)) {
      console.error(
        "[Catalog AI] La generación superó el tiempo permitido.",
        {
          durationMs,
        },
      );

      return jsonResponse(
        {
          ok: false,
          error:
            "La imagen tardó demasiado en generarse. Inténtalo nuevamente o cambia temporalmente la calidad a medium.",
          code: "OPENAI_IMAGE_TIMEOUT",
          durationMs,
        },
        504,
      );
    }

    console.error(
      "[Catalog AI] Error inesperado:",
      error,
    );

    return jsonResponse(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudo generar la imagen de catálogo.",
        durationMs,
      },
      500,
    );
  }
}