import type { ReactNode } from "react";
import PosShell from "../components/pos-shell";
import "../components/pos-ui/pos-tokens.css";

export default function PosLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <PosShell>{children}</PosShell>;
}
