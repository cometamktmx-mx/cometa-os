export type ShippingMode = "RETAIL" | "WHOLESALE";
export type ShippingPolicy = { freeShippingThreshold?: number | null; sellerSubsidyPercent?: number; sellerMaxSubsidy?: number | null; cometaSubsidy?: number; buyerPaysPercent?: number };
export type ShippingAllocation = { providerCost: number; baselineCost: number; buyerShippingCharge: number; sellerShippingSubsidy: number; cometaShippingSubsidy: number };
export type ShippingPackage = { weightKg: number; lengthCm: number; widthCm: number; heightCm: number; itemCount: number; preset: string };
export type ShippingQuote = { provider: string; serviceCode: string; etaDays: number; cost: number; package: ShippingPackage };
export function allocateShipping(providerCost: number, baselineCost: number, subtotal: number, policy: ShippingPolicy = {}): ShippingAllocation {
  const provider = Math.max(0, providerCost); const baseline = Math.max(0, Math.min(baselineCost, provider));
  const cometa = Math.min(provider, Math.max(0, policy.cometaSubsidy ?? 0));
  const free = policy.freeShippingThreshold != null && subtotal >= policy.freeShippingThreshold;
  const percent = Math.max(0, Math.min(100, policy.sellerSubsidyPercent ?? 0));
  const requestedSeller = free ? baseline : baseline * (percent / 100);
  const seller = Math.min(Math.max(0, policy.sellerMaxSubsidy == null ? requestedSeller : Math.min(requestedSeller, policy.sellerMaxSubsidy)), provider - cometa);
  const buyer = Math.max(0, provider - seller - cometa);
  return { providerCost: provider, baselineCost: baseline, buyerShippingCharge: Number(buyer.toFixed(2)), sellerShippingSubsidy: Number(seller.toFixed(2)), cometaShippingSubsidy: Number(cometa.toFixed(2)) };
}
export function chooseServices(quotes: ShippingQuote[]) { const valid = quotes.filter((q) => q.cost >= 0 && q.etaDays > 0); if (!valid.length) return { standard: null, fast: null }; const standard = [...valid].sort((a,b) => a.cost-b.cost || a.etaDays-b.etaDays)[0]; const fast = [...valid].filter((q) => q.etaDays <= 3).sort((a,b) => a.cost-b.cost || a.etaDays-b.etaDays)[0] ?? [...valid].sort((a,b) => a.etaDays-b.etaDays || a.cost-b.cost)[0]; return { standard, fast };
}
export function estimateTextilePackage(input: { itemCount: number; totalWeightG: number; profile?: string; overrideWeightG?: number | null }): ShippingPackage[] {
  const weight = Math.max(1, input.overrideWeightG ?? input.totalWeightG); const perPackage = 5000; const count = Math.max(1, Math.ceil(weight / perPackage)); const packages: ShippingPackage[] = []; for (let i=0;i<count;i++) { const kg = Math.min(perPackage, weight - i*perPackage) / 1000; const preset = kg <= 1 ? "TEXTILE_S" : kg <= 3 ? "TEXTILE_M" : kg <= 5 ? "TEXTILE_L" : "WHOLESALE_MULTI"; packages.push({ weightKg: Number(kg.toFixed(3)), lengthCm: preset === "TEXTILE_S" ? 30 : preset === "TEXTILE_M" ? 40 : 60, widthCm: preset === "TEXTILE_S" ? 25 : 30, heightCm: preset === "TEXTILE_S" ? 8 : preset === "TEXTILE_M" ? 15 : 25, itemCount: i === count-1 ? input.itemCount - Math.floor(input.itemCount/count)*i : Math.floor(input.itemCount/count), preset }); } return packages;
}
