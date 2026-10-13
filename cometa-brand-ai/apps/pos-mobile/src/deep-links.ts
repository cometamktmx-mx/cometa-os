export type MobileLink = { kind: "callback" | "recovery"; code: string } | { kind: "pos"; path: string };
export function parseMobileLink(value: string, channel: string): MobileLink | null {
  if (channel !== "beta") return null;
  const url = new URL(value);
  if (url.origin !== "https://pos-beta.cometaos.com" || url.username || url.password || url.hash) throw Error("Unapproved app link");
  if ([...url.searchParams.keys()].some(k => k !== "code")) throw Error("Unexpected link parameters");
  if (url.pathname === "/mobile/auth/callback" || url.pathname === "/mobile/auth/recovery") {
    const code = url.searchParams.get("code");
    if (!code || !/^[a-zA-Z0-9_-]{8,512}$/.test(code) || url.searchParams.getAll("code").length !== 1) throw Error("Invalid one-time code");
    return { kind: url.pathname.endsWith("recovery") ? "recovery" : "callback", code };
  }
  if (/^\/mobile\/pos\/[a-z0-9/-]*$/.test(url.pathname) && !url.search) return { kind: "pos", path: url.pathname };
  throw Error("Unsupported mobile link");
}
