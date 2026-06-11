export async function scrapeCompetitors(competitorUrls: string[]) {
  return competitorUrls.map((url) => ({
    url,
    followers: "No detectado",
    following: "No detectado",
    posts: "No detectado",
    engagementSignals: null,
    scrapingStatus: {
      success: false,
      source: url,
      error: "Benchmark scraper desactivado temporalmente para producción en Vercel.",
    },
  }));
}