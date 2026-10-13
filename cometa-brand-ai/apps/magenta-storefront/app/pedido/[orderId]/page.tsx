import { CheckoutPage } from "../../../lib/checkout-page";
import { uuidPattern } from "../../../../../packages/own-storefront/product-contract";
import { notFound } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{ orderId: string }> }) { const { orderId } = await params;if (!uuidPattern.test(orderId)) notFound();return <CheckoutPage orderId={orderId} />; }
