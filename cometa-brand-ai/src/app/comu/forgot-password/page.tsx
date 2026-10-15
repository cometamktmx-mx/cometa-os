import { ComuAuthForm } from "../components/auth-form";
import { safeComuNext } from "@/lib/comu/auth-navigation";
export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) { return <ComuAuthForm mode="recovery" next={safeComuNext((await searchParams).next)} />; }
