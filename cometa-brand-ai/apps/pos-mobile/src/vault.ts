import { Capacitor } from "@capacitor/core";
import { NativeBiometric } from "@capgo/capacitor-native-biometric";
import { mobileConfig } from "./environment";
const memory = new Map<string, string>();
const namespace = mobileConfig.channel === "development" ? "cometa-pos-m2" : `cometa-pos:${mobileConfig.channel}:${new URL(mobileConfig.supabaseUrl).hostname}`;
let pending: Promise<void> = Promise.resolve();
function serial<T>(work: () => Promise<T>): Promise<T> {
  const result = pending.then(work);
  pending = result.then(() => undefined, () => undefined);
  return result;
}
// Browser development is intentionally memory-only. There is no persistent web fallback.
export const vault = {
  getItem(key: string): Promise<string | null> { return serial(async () => {
    if (!Capacitor.isNativePlatform()) return memory.get(key) ?? null;
    const entry = { key: `${namespace}:${key}` };
    if (!(await NativeBiometric.isDataSaved(entry)).isSaved) return null;
    return (await NativeBiometric.getData(entry)).value;
  }); },
  setItem(key: string, value: string) { return serial(async () => {
    if (!Capacitor.isNativePlatform()) { memory.set(key, value); return; }
    await NativeBiometric.setData({ key: `${namespace}:${key}`, value });
  }); },
  removeItem(key: string) { return serial(async () => {
    if (!Capacitor.isNativePlatform()) { memory.delete(key); return; }
    const entry = { key: `${namespace}:${key}` };
    if ((await NativeBiometric.isDataSaved(entry)).isSaved) await NativeBiometric.deleteData(entry);
  }); },
};
