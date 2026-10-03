import { requireComuReviewer } from "@/lib/comu/seller-approval";
import SellerAdmin from "./seller-admin";
export const dynamic = "force-dynamic";
export default async function ComuAdminPage() {
  await requireComuReviewer();
  return <SellerAdmin />;
}
