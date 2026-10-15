import type { ReactNode } from "react";
import { StudioLiveController } from "./studio-live-controller";

export default function StudioLayout({ children }: { children: ReactNode }) { return <><StudioLiveController />{children}</>; }
