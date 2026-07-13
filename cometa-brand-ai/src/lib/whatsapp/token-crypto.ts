import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

const TOKEN_ALGORITHM = "aes-256-gcm";
const REQUIRED_KEY_LENGTH = 32;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

export type EncryptedWhatsappToken = {
  tokenCiphertext: string;
  tokenIv: string;
  tokenAuthTag: string;
  tokenAlgorithm: "aes-256-gcm";
  keyVersion: number;
};

function getEncryptionKey(): Buffer {
  const encodedKey = String(
    process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY || ""
  ).trim();

  if (!encodedKey) {
    throw new Error(
      "Falta la variable WHATSAPP_TOKEN_ENCRYPTION_KEY."
    );
  }

  const key = Buffer.from(encodedKey, "base64");

  if (key.length !== REQUIRED_KEY_LENGTH) {
    throw new Error(
      "WHATSAPP_TOKEN_ENCRYPTION_KEY debe representar exactamente 32 bytes."
    );
  }

  return key;
}

function getKeyVersion(): number {
  const rawVersion =
    process.env.WHATSAPP_TOKEN_KEY_VERSION || "1";

  const version = Number.parseInt(rawVersion, 10);

  if (!Number.isInteger(version) || version < 1) {
    throw new Error(
      "WHATSAPP_TOKEN_KEY_VERSION debe ser un entero mayor o igual a 1."
    );
  }

  return version;
}

export function encryptWhatsappToken(
  plainToken: string
): EncryptedWhatsappToken {
  const normalizedToken = String(plainToken || "").trim();

  if (!normalizedToken) {
    throw new Error("No se puede cifrar un token vacío.");
  }

  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(
    TOKEN_ALGORITHM,
    key,
    iv
  );

  const ciphertext = Buffer.concat([
    cipher.update(normalizedToken, "utf8"),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return {
    tokenCiphertext: ciphertext.toString("base64"),
    tokenIv: iv.toString("base64"),
    tokenAuthTag: authTag.toString("base64"),
    tokenAlgorithm: TOKEN_ALGORITHM,
    keyVersion: getKeyVersion(),
  };
}

export function decryptWhatsappToken({
  tokenCiphertext,
  tokenIv,
  tokenAuthTag,
  tokenAlgorithm,
}: {
  tokenCiphertext: string;
  tokenIv: string;
  tokenAuthTag: string;
  tokenAlgorithm?: string | null;
}): string {
  const algorithm = String(
    tokenAlgorithm || TOKEN_ALGORITHM
  ).trim();

  if (algorithm !== TOKEN_ALGORITHM) {
    throw new Error(
      `Algoritmo de token no compatible: ${algorithm}.`
    );
  }

  const ciphertext = Buffer.from(
    tokenCiphertext,
    "base64"
  );

  const iv = Buffer.from(tokenIv, "base64");

  const authTag = Buffer.from(
    tokenAuthTag,
    "base64"
  );

  if (!ciphertext.length) {
    throw new Error(
      "El contenido cifrado almacenado no es válido."
    );
  }

  if (iv.length !== IV_LENGTH) {
    throw new Error(
      "El IV almacenado para el token no es válido."
    );
  }

  if (authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error(
      "La etiqueta de autenticación almacenada no es válida."
    );
  }

  const decipher = createDecipheriv(
    TOKEN_ALGORITHM,
    getEncryptionKey(),
    iv
  );

  decipher.setAuthTag(authTag);

  const plainToken = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");

  if (!plainToken) {
    throw new Error(
      "No fue posible descifrar el token."
    );
  }

  return plainToken;
}