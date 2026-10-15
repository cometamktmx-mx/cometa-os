import { redirect } from "next/navigation";
import { getUserWorkspaceContext, getWorkspaceDestination } from "@/lib/workspace/context";
export const dynamic = "force-dynamic";
export default async function AccountEntry() {
  redirect(getWorkspaceDestination(await getUserWorkspaceContext()));
}
