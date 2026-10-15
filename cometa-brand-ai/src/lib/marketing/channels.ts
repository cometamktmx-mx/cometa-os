import "server-only";

export const SUPPORTED_MARKETING_PLATFORMS = ["instagram", "facebook", "whatsapp", "tiktok"] as const;
export type MarketingPlatform = (typeof SUPPORTED_MARKETING_PLATFORMS)[number];

const aliases: Array<[MarketingPlatform, string[]]> = [
  ["instagram", ["instagram"]],
  ["facebook", ["facebook"]],
  ["whatsapp", ["whatsapp", "what's app"]],
  ["tiktok", ["tiktok", "tik tok"]],
];

function extract(value: unknown): MarketingPlatform[] {
  const values = Array.isArray(value) ? value : [value];
  const found: Array<{ platform: MarketingPlatform; index: number; order: number }> = [];
  for (const [order, entry] of values.entries()) {
    if (typeof entry !== "string") continue;
    const candidate = entry.toLocaleLowerCase().normalize("NFKC");
    for (const [platform, names] of aliases) {
      for (const name of names) {
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const match = candidate.match(new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`));
        if (match && match.index !== undefined) found.push({ platform, index: match.index, order });
      }
    }
  }
  return found.sort((a, b) => a.order - b.order || a.index - b.index).map(({ platform }) => platform).filter((platform, index, list) => list.indexOf(platform) === index);
}

export function normalizeMarketingChannels(value: unknown): MarketingPlatform[] {
  return extract(value);
}

export function resolveMarketingChannels(input: { contextClaim?: unknown; publishedStrategyChannels?: unknown }): MarketingPlatform[] {
  const claim = input.contextClaim && typeof input.contextClaim === "object" && !Array.isArray(input.contextClaim) ? input.contextClaim as Record<string, unknown> : null;
  const contextChannels = claim && ["confirmed", "verified"].includes(String(claim.state)) ? extract(claim.value) : [];
  const strategyChannels = Array.isArray(input.publishedStrategyChannels) ? input.publishedStrategyChannels : [input.publishedStrategyChannels];
  return extract([...contextChannels, ...strategyChannels]);
}
