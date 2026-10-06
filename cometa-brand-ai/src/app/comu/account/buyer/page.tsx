import { redirect } from "next/navigation";
import BuyerAccount from "./buyer-account";
export default async function BuyerPage({ searchParams }: { searchParams: Promise<{ section?: string }> }) { const { section } = await searchParams; if (section === "Pedidos" || section === "Mis pedidos") redirect("/comu/account/orders"); return <BuyerAccount initialSection={section} />; }
