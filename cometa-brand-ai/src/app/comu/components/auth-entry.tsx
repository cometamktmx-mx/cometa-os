import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { safeComuNext } from "@/lib/comu/auth-navigation";
import { ComuAuthForm } from "./auth-form";
export async function ComuAuthEntry({ mode, searchParams }: { mode: "login" | "register"; searchParams: Promise<{ next?: string; error?: string }> }) {
  const params = await searchParams;
  const next = safeComuNext(params.next);
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (user) redirect(next);
  return <ComuAuthForm mode={mode} next={next} callbackError={Boolean(params.error)} />;
}
