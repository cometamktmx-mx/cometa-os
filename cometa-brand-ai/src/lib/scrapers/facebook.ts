export async function scrapeFacebookPage(facebookUrl: string) {
  return {
    url: facebookUrl,
    extractedText: "",
    screenshotUrl: "",
    profileSignals: null,
    contentSignals: null,
    scrapingStatus: {
      success: false,
      source: facebookUrl,
      error: "Scraper de Facebook desactivado temporalmente para producción en Vercel.",
    },
  };
}