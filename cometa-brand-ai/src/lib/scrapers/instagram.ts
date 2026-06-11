// instagram.ts
export async function scrapeInstagramProfile(instagramUrl: string) {
  return {
    url: instagramUrl,
    extractedText: "",
    screenshotUrl: "",
    profileSignals: null,
    engagementSignals: null,
    scrapingStatus: {
      success: false,
      source: instagramUrl,
      error: "Scraper de Instagram desactivado temporalmente para producción en Vercel.",
    },
  };
}