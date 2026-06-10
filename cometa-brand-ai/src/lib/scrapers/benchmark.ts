import { scrapeInstagramProfile } from "./instagram";

export async function scrapeCompetitors(urls: string[]) {
  const competitors = [];

  for (const url of urls) {
    try {
      const profile = await scrapeInstagramProfile(url);

      competitors.push({
        url,
        followers:
          profile?.profileSignals?.followersLine || "No detectado",
        following:
          profile?.profileSignals?.followingLine || "No detectado",
        posts:
          profile?.profileSignals?.postsLine || "No detectado",
        bio:
          profile?.profileSignals?.possibleBio || "",
      });
    } catch (error) {
      competitors.push({
        url,
        followers: "Error",
        following: "Error",
        posts: "Error",
        bio: "",
      });
    }
  }

  return competitors;
}