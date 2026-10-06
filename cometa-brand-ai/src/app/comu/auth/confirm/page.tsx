import { ComuAuthForm } from "../../components/auth-form";
import { safeComuNext } from "@/lib/comu/auth-navigation";
export const metadata = { referrer: "no-referrer" as const };
export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string; code?: string; token_hash?: string; type?: string }> }) {
  const params = await searchParams;
  return <ComuAuthForm mode="confirm" next={safeComuNext(params.next)} code={params.code} tokenHash={["email", "signup"].includes(params.type || "") ? params.token_hash : undefined} />;
}
