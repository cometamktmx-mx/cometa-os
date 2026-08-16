import { randomUUID } from "node:crypto";
import {
  getBrandSlugFromUrl,
  handlePosError,
  ok,
  PosApiError,
  readJsonBody,
} from "@/lib/pos/server";
import { requirePosOperationalAccess } from "@/lib/pos/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET_NAME = "pos-products";
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

type DetectedImage = {
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  extension: "jpg" | "png" | "webp";
};

type DeleteImageBody = {
  imageUrl?: unknown;
};

export async function POST(request: Request) {
  try {
    const requestedBrandSlug = getBrandSlugFromUrl(request);
    const { admin, brand } = await requirePosOperationalAccess({ brandSlug: requestedBrandSlug, entitlement: "pos.products" });
    let formData: FormData;

    try {
      formData = await request.formData();
    } catch {
      throw new PosApiError(
        400,
        "POS_PRODUCT_IMAGE_FORM_INVALID",
        "La carga de imagen no es válida."
      );
    }

    const file = formData.get("file");

    if (!(file instanceof File)) {
      throw new PosApiError(
        400,
        "POS_PRODUCT_IMAGE_REQUIRED",
        "Selecciona una imagen para subir."
      );
    }

    if (file.size <= 0) {
      throw new PosApiError(
        400,
        "POS_PRODUCT_IMAGE_EMPTY",
        "La imagen está vacía."
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new PosApiError(
        413,
        "POS_PRODUCT_IMAGE_TOO_LARGE",
        "La imagen no puede superar 5 MB."
      );
    }

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      throw new PosApiError(
        415,
        "POS_PRODUCT_IMAGE_TYPE_INVALID",
        "Usa una imagen JPG, PNG o WEBP."
      );
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const detectedImage = detectImage(bytes);

    if (!detectedImage || detectedImage.mimeType !== file.type) {
      throw new PosApiError(
        415,
        "POS_PRODUCT_IMAGE_SIGNATURE_INVALID",
        "El contenido del archivo no coincide con un JPG, PNG o WEBP válido."
      );
    }

    const storagePath = `${brand.slug}/${randomUUID()}/${randomUUID()}.${detectedImage.extension}`;
    const { error: uploadError } = await admin.storage
      .from(BUCKET_NAME)
      .upload(storagePath, bytes, {
        cacheControl: "3600",
        contentType: detectedImage.mimeType,
        upsert: false,
      });

    if (uploadError) {
      throw new PosApiError(
        500,
        "POS_PRODUCT_IMAGE_UPLOAD_FAILED",
        "No se pudo subir la imagen del producto."
      );
    }

    const { data: publicUrlData } = admin.storage
      .from(BUCKET_NAME)
      .getPublicUrl(storagePath);

    return ok(
      {
        imageUrl: publicUrlData.publicUrl,
        storagePath,
      },
      201
    );
  } catch (error) {
    return handlePosError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const requestedBrandSlug = getBrandSlugFromUrl(request);
    const { admin, brand } = await requirePosOperationalAccess({ brandSlug: requestedBrandSlug, entitlement: "pos.products" });
    const body = await readJsonBody<DeleteImageBody>(request);
    const imageUrl = String(body.imageUrl ?? "").trim();

    if (!imageUrl) {
      throw new PosApiError(
        400,
        "POS_PRODUCT_IMAGE_URL_REQUIRED",
        "Se requiere la URL de la imagen."
      );
    }

    const storagePath = getOwnedStoragePath(imageUrl, brand.slug);

    if (!storagePath) {
      return ok({ deleted: false });
    }

    const { error: removeError } = await admin.storage
      .from(BUCKET_NAME)
      .remove([storagePath]);

    if (removeError) {
      throw new PosApiError(
        500,
        "POS_PRODUCT_IMAGE_DELETE_FAILED",
        "No se pudo eliminar la imagen del producto."
      );
    }

    return ok({ deleted: true });
  } catch (error) {
    return handlePosError(error);
  }
}

function detectImage(bytes: Uint8Array): DetectedImage | null {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return { mimeType: "image/jpeg", extension: "jpg" };
  }

  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

  if (
    bytes.length >= pngSignature.length &&
    pngSignature.every((value, index) => bytes[index] === value)
  ) {
    return { mimeType: "image/png", extension: "png" };
  }

  if (
    bytes.length >= 12 &&
    readAscii(bytes, 0, 4) === "RIFF" &&
    readAscii(bytes, 8, 12) === "WEBP"
  ) {
    return { mimeType: "image/webp", extension: "webp" };
  }

  return null;
}

function readAscii(bytes: Uint8Array, start: number, end: number) {
  return String.fromCharCode(...bytes.slice(start, end));
}

function getOwnedStoragePath(imageUrl: string, brandSlug: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!supabaseUrl) return null;

  try {
    const parsedImageUrl = new URL(imageUrl);
    const parsedSupabaseUrl = new URL(supabaseUrl);

    if (parsedImageUrl.origin !== parsedSupabaseUrl.origin) return null;

    const publicPathPrefix = `/storage/v1/object/public/${BUCKET_NAME}/`;

    if (!parsedImageUrl.pathname.startsWith(publicPathPrefix)) return null;

    const encodedPath = parsedImageUrl.pathname.slice(publicPathPrefix.length);
    const storagePath = decodeURIComponent(encodedPath);
    const segments = storagePath.split("/");

    if (
      segments.length !== 3 ||
      segments[0] !== brandSlug ||
      !isUuid(segments[1]) ||
      !isGeneratedImageName(segments[2])
    ) {
      return null;
    }

    return storagePath;
  } catch {
    return null;
  }
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function isGeneratedImageName(value: string) {
  const match = value.match(/^(.+)\.(jpg|png|webp)$/i);

  return Boolean(match && isUuid(match[1]));
}
