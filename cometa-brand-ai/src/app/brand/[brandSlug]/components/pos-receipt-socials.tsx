type ReceiptSocials = { instagram?: string | null; facebook?: string | null; tiktok?: string | null };

// Inline vectors work offline and inherit the thermal ticket's black ink.
export function PosReceiptSocials({ socials }: { socials: ReceiptSocials }) {
  return <div className="space-y-1 text-center">
    {(["instagram", "facebook", "tiktok"] as const).map(network => {
      const username = socials[network];
      if (!username?.trim()) return null;
      const label = network === "instagram" ? "Instagram" : network === "facebook" ? "Facebook" : "TikTok";
      return <div key={network} data-receipt-social={network} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "4px", breakInside: "avoid" }}>
        <svg role="img" aria-label={label} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          {network === "instagram" ? <><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r=".7" fill="currentColor" /></> : network === "facebook" ? <path d="M14 21v-8h3l.5-4H14V7c0-1 .5-2 2-2h2V2h-3c-3 0-5 2-5 5v2H7v4h3v8" /> : <path d="M14 3h3c0 3 2 5 5 5v3c-2 0-4-.7-5-2v8a6 6 0 1 1-6-6v3a3 3 0 1 0 3 3V3Z" />}
        </svg>
        <span style={{ overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>{username}</span>
      </div>;
    })}
  </div>;
}
