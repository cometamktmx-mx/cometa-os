import type { SVGProps } from "react";

export type PosIconName =
  | "home"
  | "dashboard"
  | "overview"
  | "register"
  | "sales"
  | "cart"
  | "products"
  | "product"
  | "barcode"
  | "scan"
  | "inventory"
  | "box"
  | "customers"
  | "customer"
  | "user"
  | "loyalty"
  | "rewards"
  | "wallet"
  | "cash"
  | "receipt"
  | "reports"
  | "report"
  | "trend"
  | "activity"
  | "warning"
  | "store"
  | "branch"
  | "settings"
  | "search"
  | "plus"
  | "minus"
  | "check"
  | "arrow"
  | "back"
  | "chevron"
  | "menu"
  | "close"
  | "logout"
  | "discount"
  | (string & {});

type PosIconProps = Omit<SVGProps<SVGSVGElement>, "name"> & {
  name: PosIconName;
  title?: string;
};

export function PosIcon({
  name,
  className,
  title,
  ...props
}: PosIconProps) {
  const normalizedName = String(name || "").trim().toLowerCase();

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      focusable="false"
      {...props}
    >
      {title ? <title>{title}</title> : null}

      <IconContent name={normalizedName} />
    </svg>
  );
}

function IconContent({ name }: { name: string }) {
  switch (name) {
    case "home":
      return (
        <>
          <path d="M3.5 10.5 12 3l8.5 7.5" />
          <path d="M5.5 9.5V21h13V9.5" />
          <path d="M9.5 21v-6h5v6" />
        </>
      );

    case "dashboard":
    case "overview":
      return (
        <>
          <rect x="3" y="3" width="7" height="7" rx="2" />
          <rect x="14" y="3" width="7" height="7" rx="2" />
          <rect x="3" y="14" width="7" height="7" rx="2" />
          <rect x="14" y="14" width="7" height="7" rx="2" />
        </>
      );

    case "register":
    case "sales":
    case "cart":
      return (
        <>
          <path d="M3 4h2l1.8 10.2a2 2 0 0 0 2 1.7h8.9a2 2 0 0 0 2-1.6L21 8H6" />
          <circle cx="9" cy="20" r="1" />
          <circle cx="18" cy="20" r="1" />
          <path d="M10 11h7" />
        </>
      );

    case "products":
    case "product":
      return (
        <>
          <path d="m12 3 8 4.3v9.4L12 21l-8-4.3V7.3L12 3Z" />
          <path d="m4.5 7.5 7.5 4 7.5-4" />
          <path d="M12 11.5V21" />
        </>
      );

    case "barcode":
      return (
        <>
          <path d="M4 5v14" />
          <path d="M7 5v14" />
          <path d="M10 5v14" />
          <path d="M14 5v14" />
          <path d="M17 5v14" />
          <path d="M20 5v14" />
        </>
      );

    case "scan":
      return (
        <>
          <path d="M4 8V5a1 1 0 0 1 1-1h3" />
          <path d="M16 4h3a1 1 0 0 1 1 1v3" />
          <path d="M20 16v3a1 1 0 0 1-1 1h-3" />
          <path d="M8 20H5a1 1 0 0 1-1-1v-3" />
          <path d="M7 12h10" />
        </>
      );

    case "inventory":
    case "box":
      return (
        <>
          <path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9Z" />
          <path d="m4.5 7.7 7.5 4.2 7.5-4.2" />
          <path d="M12 12v9" />
          <path d="m8 5.3 8 4.5" />
        </>
      );

    case "customers":
    case "customer":
    case "user":
      return (
        <>
          <circle cx="12" cy="8" r="4" />
          <path d="M4.5 21a7.5 7.5 0 0 1 15 0" />
        </>
      );

    case "loyalty":
    case "rewards":
      return (
        <>
          <path d="M12 21s-7-4.4-7-10.3A4.2 4.2 0 0 1 12 7a4.2 4.2 0 0 1 7 3.7C19 16.6 12 21 12 21Z" />
          <path d="m12 9.2.9 1.8 2 .3-1.4 1.4.3 2-1.8-.9-1.8.9.3-2-1.4-1.4 2-.3.9-1.8Z" />
        </>
      );

    case "wallet":
      return (
        <>
          <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H18a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6.5Z" />
          <path d="M4 8h14.5A1.5 1.5 0 0 1 20 9.5V15h-5a3 3 0 0 1 0-6h5" />
          <circle cx="15" cy="12" r=".7" fill="currentColor" stroke="none" />
        </>
      );

    case "cash":
      return (
        <>
          <rect x="3" y="5" width="18" height="14" rx="3" />
          <circle cx="12" cy="12" r="3" />
          <path d="M7 9H6" />
          <path d="M18 15h-1" />
          <path d="M12 9.5v5" />
        </>
      );

    case "receipt":
      return (
        <>
          <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" />
          <path d="M9 8h6" />
          <path d="M9 12h6" />
          <path d="M9 16h4" />
        </>
      );

    case "reports":
    case "report":
      return (
        <>
          <path d="M4 20V10" />
          <path d="M10 20V4" />
          <path d="M16 20v-7" />
          <path d="M22 20H2" />
        </>
      );

    case "trend":
      return (
        <>
          <path d="m3 17 6-6 4 4 8-9" />
          <path d="M15 6h6v6" />
        </>
      );

    case "activity":
      return (
        <>
          <path d="M3 12h4l2.2-6 4 12 2.2-6H21" />
        </>
      );

    case "warning":
      return (
        <>
          <path d="M10.3 4.1 2.8 17.5A2 2 0 0 0 4.6 20h14.8a2 2 0 0 0 1.8-2.5L13.7 4.1a2 2 0 0 0-3.4 0Z" />
          <path d="M12 9v4" />
          <circle cx="12" cy="16.5" r=".8" fill="currentColor" stroke="none" />
        </>
      );

    case "store":
    case "branch":
      return (
        <>
          <path d="M4 10v10h16V10" />
          <path d="M3 10 5 4h14l2 6" />
          <path d="M3 10a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0" />
          <path d="M9 20v-6h6v6" />
        </>
      );

    case "settings":
      return (
        <>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9A1.7 1.7 0 0 0 21 10h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
        </>
      );

    case "search":
      return (
        <>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-4-4" />
        </>
      );

    case "plus":
      return (
        <>
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </>
      );

    case "minus":
      return <path d="M5 12h14" />;

    case "check":
      return <path d="m5 12 4 4L19 6" />;

    case "arrow":
      return (
        <>
          <path d="M5 12h14" />
          <path d="m14 7 5 5-5 5" />
        </>
      );

    case "back":
      return (
        <>
          <path d="M19 12H5" />
          <path d="m10 7-5 5 5 5" />
        </>
      );

    case "chevron":
      return <path d="m9 6 6 6-6 6" />;

    case "menu":
      return (
        <>
          <path d="M4 7h16" />
          <path d="M4 12h16" />
          <path d="M4 17h16" />
        </>
      );

    case "close":
      return (
        <>
          <path d="m6 6 12 12" />
          <path d="M18 6 6 18" />
        </>
      );

    case "logout":
      return (
        <>
          <path d="M10 5H5v14h5" />
          <path d="M14 8l4 4-4 4" />
          <path d="M18 12H9" />
        </>
      );

    case "discount":
      return (
        <>
          <path d="M20 13 13 20 4 11V4h7l9 9Z" />
          <circle cx="8.5" cy="8.5" r="1" />
        </>
      );

    default:
      return (
        <>
          <rect x="4" y="4" width="6" height="6" rx="1.5" />
          <rect x="14" y="4" width="6" height="6" rx="1.5" />
          <rect x="4" y="14" width="6" height="6" rx="1.5" />
          <rect x="14" y="14" width="6" height="6" rx="1.5" />
        </>
      );
  }
}