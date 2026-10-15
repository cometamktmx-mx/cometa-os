const INTERNAL_ORIGIN = "https://cometa.invalid";

function isSafeInternalPath(value: string) {
  if (!value || value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value)) {
    return false;
  }

  try {
    const url = new URL(value, INTERNAL_ORIGIN);
    return url.origin === INTERNAL_ORIGIN && url.pathname.startsWith("/") && !url.pathname.startsWith("//");
  } catch {
    return false;
  }
}

export function safeInternalNext(value: string | null | undefined, fallback = "/workspace") {
  if (!value || !isSafeInternalPath(value.trim())) return fallback;

  const url = new URL(value.trim(), INTERNAL_ORIGIN);
  return `${url.pathname}${url.search}${url.hash}`;
}
