import { ComuAuthEntry } from "../components/auth-entry";
export default function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) { return <ComuAuthEntry mode="register" searchParams={searchParams} />; }
