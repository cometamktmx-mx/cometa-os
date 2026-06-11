// tiktok.ts
export async function scrapeTikTokProfile(tiktokUrl: string) {
  return {
    url: tiktokUrl,
    extractedText: "",
    screenshotUrl: "",
    profileSignals: null,
    contentSignals: null,
    scrapingStatus: {
      success: false,
      source: tiktokUrl,
      error: "Scraper de TikTok desactivado temporalmente para producción en Vercel.",
    },
  };
}