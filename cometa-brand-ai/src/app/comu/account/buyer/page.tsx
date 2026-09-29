import BuyerAccount from "./buyer-account";
export default async function BuyerPage({ searchParams }: { searchParams: Promise<{ section?: string }> }) { return <BuyerAccount initialSection={(await searchParams).section} />; }
