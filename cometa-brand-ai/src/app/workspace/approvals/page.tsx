import { WorkspaceShell } from "@/app/workspace/components/workspace-shell";
import { getApprovalCenterData } from "@/lib/workspace/approvals";
import { ApprovalsClient } from "./approvals-client";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const data = await getApprovalCenterData();
  return <WorkspaceShell><ApprovalsClient data={data} /></WorkspaceShell>;
}
