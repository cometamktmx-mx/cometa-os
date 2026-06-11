// website.ts
export async function scrapeWebsite(websiteUrl: string) {
  return {
    url: websiteUrl,
    extractedText: "",
    screenshotUrl: "",
    extractedData: null,
    scrapingStatus: {
      success: false,
      source: websiteUrl,
      error: "Scraper de sitio web desactivado temporalmente para producción en Vercel.",
    },
  };
}