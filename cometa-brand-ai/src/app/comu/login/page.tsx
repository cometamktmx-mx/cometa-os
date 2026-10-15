import { ComuAuthEntry } from "../components/auth-entry";
export default function Page({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) { return <ComuAuthEntry mode="login" searchParams={searchParams} />; }
