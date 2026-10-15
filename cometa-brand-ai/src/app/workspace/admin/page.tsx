import { redirect } from "next/navigation";

export default function LegacyAccessCenterRedirect() {
  redirect("/workspace/access");
}
