import "server-only";

import { createClient } from "@supabase/supabase-js";

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) throw new Error("STUDIO_SERVER_CONFIG_INVALID");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export type PrimaryAssignee = { userId: string; role: string };

export async function getPrimaryBrandProductionAssignee(brandSlug: string, role?: string): Promise<{ assignee: PrimaryAssignee | null; state: "resolved" | "missing" | "ambiguous" }> {
  const client = db();
  const brand = await client.from("brands").select("id,slug").eq("slug", brandSlug).maybeSingle();
  if (brand.error) throw brand.error;
  if (!brand.data) throw new Error("BRAND_NOT_FOUND");
  let query = client.from("mercury_team_assignments").select("user_id,role").eq("brand_slug", brand.data.slug).eq("active", true).eq("is_primary", true);
  if (role) query = query.eq("role", role);
  const result = await query.limit(2);
  if (result.error) throw result.error;
  if (!result.data?.length) return { assignee: null, state: "missing" };
  if (result.data.length !== 1) return { assignee: null, state: "ambiguous" };
  return { assignee: { userId: String(result.data[0].user_id), role: String(result.data[0].role) }, state: "resolved" };
}
