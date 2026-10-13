import { defineConfig, loadEnv } from "vite";
import tailwind from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";
import { validateEnvironment } from "./config/environment";
import approved from "../../config/pos-environments.json";
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), "VITE_"), ...process.env };
  const config = validateEnvironment(mode, env, approved);
  return {
  define: { __POS_CONFIG__: JSON.stringify(config) },
  plugins: [tailwind()],
  resolve: { alias: { "@": fileURLToPath(new URL("../../src", import.meta.url)) }, dedupe: ["react", "react-dom"] },
  server: { fs: { allow: ["../.."] }, proxy: config.channel === "development" ? { "/api/pos/mobile": config.backend } : undefined },
  build: { sourcemap: false },
  };
});
