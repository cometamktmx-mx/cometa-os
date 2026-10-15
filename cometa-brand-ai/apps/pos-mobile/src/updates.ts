export type UpdateMetadata = { applicationId: string; channel: "beta"; versionName: string; versionCode: number; minimumSupportedVersionCode: number; downloadUrl: string; sha256: string; sizeBytes: number; publishedAt: string };
export function parseUpdateMetadata(value: unknown, allowedDownloadOrigins: string[]): UpdateMetadata {
  if (!value || typeof value !== "object") throw Error("Invalid update metadata");
  const v = value as Record<string, unknown>;
  if (v.applicationId !== "com.cometaos.pos" || v.channel !== "beta" || typeof v.versionName !== "string" || !/^\d+\.\d+\.\d+-beta\.\d+$/.test(v.versionName) ||
      !Number.isSafeInteger(v.versionCode) || Number(v.versionCode) < 2 || !Number.isSafeInteger(v.minimumSupportedVersionCode) || Number(v.minimumSupportedVersionCode) < 1 || Number(v.minimumSupportedVersionCode) > Number(v.versionCode) ||
      !Number.isSafeInteger(v.sizeBytes) || Number(v.sizeBytes) <= 0 || typeof v.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(v.sha256) ||
      typeof v.publishedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T.*Z$/.test(v.publishedAt) || !Number.isFinite(Date.parse(v.publishedAt)) || typeof v.downloadUrl !== "string") throw Error("Invalid update fields");
  const u = new URL(v.downloadUrl);
  if (u.protocol !== "https:" || u.username || u.password || u.hash || u.search || !allowedDownloadOrigins.includes(u.origin) ||
      u.pathname !== `/android/beta/${v.versionCode}/cometa-pos-${v.versionName}.apk`) throw Error("Unapproved immutable APK URL");
  return v as UpdateMetadata;
}
