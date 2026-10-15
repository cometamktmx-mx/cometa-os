import { getAdminFinance } from "@/lib/comu/finance";
import FinanceDashboard from "./finance-dashboard";
export default async function AdminComuFinancePage() {
  try { return <FinanceDashboard initial={await getAdminFinance()} />; }
  catch { return <main className="mx-auto max-w-5xl px-5 py-16"><h1 className="text-3xl font-bold">Finanzas COMU</h1><p className="mt-4">No pudimos consultar las finanzas. Se requiere una cuenta COMETA Admin activa.</p></main>; }
}
