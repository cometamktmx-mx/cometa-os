import { notFound } from "next/navigation";
import "../../brand/[brandSlug]/components/pos-ui/pos-tokens.css";
import PosFoodPreviewClient from "./preview-client";

export const dynamic = "force-dynamic";

export default function PosFoodPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <PosFoodPreviewClient />;
}

