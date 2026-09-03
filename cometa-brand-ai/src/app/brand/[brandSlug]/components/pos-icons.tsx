export type PosIconName =
  | "home"
  | "sale"
  | "cash"
  | "receipt"
  | "product"
  | "inventory"
  | "customer"
  | "loyalty"
  | "report"
  | "settings"
  | "search"
  | "bell"
  | "sparkles"
  | "arrow"
  | "wallet"
  | "activity"
  | "warning"
  | "trend"
  | "store"
  | "grid"
  | "menu"
  | "plus"
  | "register"
  | "customers"
  | "products"
  | "chevron"
  | "check"
  | "barcode"
  | "upload"
  | "branch"
  | "close";

export function PosIcon({
  name,
  className = "h-5 w-5",
}: {
  name: PosIconName;
  className?: string;
}) {
  const common = {
    className,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (name) {
    case "home":
      return (
        <svg {...common}>
          <path d="m3 10.5 9-7 9 7" />
          <path d="M5.5 9.5V21h13V9.5" />
          <path d="M9.5 21v-7h5v7" />
        </svg>
      );

    case "sale":
      return (
        <svg {...common}>
          <path d="M4 19V8.5A2.5 2.5 0 0 1 6.5 6H18" />
          <path d="M7 3h11a2 2 0 0 1 2 2v14H7a3 3 0 0 1 0-6h13" />
          <path d="M16 9h.01" />
        </svg>
      );

    case "cash":
      return (
        <svg {...common}>
          <rect x="3" y="6" width="18" height="12" rx="2" />
          <path d="M7 10h.01M17 14h.01" />
          <circle cx="12" cy="12" r="2.5" />
        </svg>
      );

    case "receipt":
      return (
        <svg {...common}>
          <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" />
          <path d="M9 8h6M9 12h6M9 16h4" />
        </svg>
      );

    case "product":
      return (
        <svg {...common}>
          <path d="m12 3 8 4.5-8 4.5-8-4.5L12 3Z" />
          <path d="m4 7.5 8 4.5 8-4.5V16l-8 5-8-5V7.5Z" />
          <path d="M12 12v9" />
        </svg>
      );

    case "inventory":
      return (
        <svg {...common}>
          <path d="M4 7h16v13H4z" />
          <path d="M2.5 4h19v3h-19zM9 11h6" />
        </svg>
      );

    case "customer":
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3" />
          <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
          <path d="M16 11.5a3 3 0 0 1 0 5.8M17.5 20a4.5 4.5 0 0 0-2.2-3.9" />
        </svg>
      );

    case "loyalty":
      return (
        <svg {...common}>
          <path d="M12 21s-7-4.4-7-11a4 4 0 0 1 7-2.7A4 4 0 0 1 19 10c0 6.6-7 11-7 11Z" />
          <path d="m9.5 11.5 1.7 1.7 3.4-3.4" />
        </svg>
      );

    case "report":
      return (
        <svg {...common}>
          <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
        </svg>
      );

    case "settings":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21H9.6v-.1A1.7 1.7 0 0 0 8.2 19.3a1.7 1.7 0 0 0-1.8.4l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3V9.6h.1A1.7 1.7 0 0 0 4.7 8.2a1.7 1.7 0 0 0-.4-1.8l-.06-.06L7.07 3.5l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.1A1.7 1.7 0 0 0 15.8 4.7a1.7 1.7 0 0 0 1.8-.4l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.4.6.9.8 1.6.8h.1v4H21a1.7 1.7 0 0 0-1.6 1.2Z" />
        </svg>
      );

    case "search":
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-4-4" />
        </svg>
      );

    case "bell":
      return (
        <svg {...common}>
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
          <path d="M10 21h4" />
        </svg>
      );

    case "sparkles":
      return (
        <svg {...common}>
          <path d="m12 3 1.2 3.2L16.5 7.5l-3.3 1.3L12 12l-1.2-3.2-3.3-1.3 3.3-1.3L12 3Z" />
          <path d="m18.5 13 .7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8ZM5.5 14l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9.9-2.1Z" />
        </svg>
      );

    case "arrow":
      return (
        <svg {...common}>
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      );

    case "wallet":
      return (
        <svg {...common}>
          <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H18a2 2 0 0 1 2 2v12H6.5A2.5 2.5 0 0 1 4 15.5v-9Z" />
          <path d="M4 8h16M15 12h5v4h-5a2 2 0 0 1 0-4Z" />
        </svg>
      );

    case "activity":
      return (
        <svg {...common}>
          <path d="M3 12h4l2-5 4 10 2-5h6" />
        </svg>
      );

    case "warning":
      return (
        <svg {...common}>
          <path d="M12 3 2.5 20h19L12 3Z" />
          <path d="M12 9v4M12 17h.01" />
        </svg>
      );

    case "trend":
      return (
        <svg {...common}>
          <path d="m3 17 6-6 4 4 8-9" />
          <path d="M15 6h6v6" />
        </svg>
      );

    case "store":
      return (
        <svg {...common}>
          <path d="M4 10v10h16V10" />
          <path d="M3 4h18l-1 6a3 3 0 0 1-5 1.5A3 3 0 0 1 12 13a3 3 0 0 1-3-1.5A3 3 0 0 1 4 10L3 4Z" />
        </svg>
      );

    case "grid":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </svg>
      );

    case "menu":
      return <svg {...common}><path d="M4 7h16M4 12h16M4 17h16" /></svg>;

    case "plus":
      return <svg {...common}><path d="M12 5v14M5 12h14" /></svg>;

    case "register":
      return <svg {...common}><path d="M5 9h14v11H5zM7 4h10l2 5H5l2-5Z" /><path d="M8 13h3M8 16h8" /></svg>;

    case "customers":
      return <svg {...common}><circle cx="8" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M2.5 20a5.5 5.5 0 0 1 11 0M13 20a4.5 4.5 0 0 1 8.5 0" /></svg>;

    case "products":
      return <svg {...common}><path d="m8 3 5 3-5 3-5-3 5-3ZM3 6v6l5 3 5-3V6M16 9l5 3-5 3-5-3M11 12v6l5 3 5-3v-6" /></svg>;

    case "chevron":
      return <svg {...common}><path d="m9 18 6-6-6-6" /></svg>;

    case "check":
      return <svg {...common}><path d="m5 12 4 4L19 6" /></svg>;

    case "barcode":
      return <svg {...common}><path d="M4 5v14M7 5v14M11 5v14M14 5v14M16.5 5v14M20 5v14" /></svg>;

    case "upload":
      return <svg {...common}><path d="M12 16V4M7 9l5-5 5 5M4 15v5h16v-5" /></svg>;

    case "branch":
      return <svg {...common}><circle cx="6" cy="5" r="2" /><circle cx="18" cy="7" r="2" /><circle cx="18" cy="18" r="2" /><path d="M8 5h3a3 3 0 0 1 3 3v7a3 3 0 0 0 3 3M14 10a3 3 0 0 1 3-3" /></svg>;

    case "close":
      return (
        <svg {...common}>
          <path d="m6 6 12 12M18 6 6 18" />
        </svg>
      );

    default:
      return null;
  }
}
