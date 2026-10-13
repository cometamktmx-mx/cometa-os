import type { CapacitorConfig } from "@capacitor/cli";
// Stable identity explicitly approved for M2.5. Changes require owner authorization.
const appId = "com.cometaos.pos";
const config: CapacitorConfig = {
  appId, appName: "COMETA POS", webDir: "dist",
  server: { androidScheme: "https" },
  plugins: {
    SplashScreen: { launchAutoHide: false, backgroundColor: "#061019", showSpinner: false, launchFadeOutDuration: 120 },
    SystemBars: { style: "DARK", insetsHandling: "css" },
  },
};
export default config;
