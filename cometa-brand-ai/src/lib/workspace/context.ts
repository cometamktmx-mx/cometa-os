import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createClient as createServerAuthClient } from "@/lib/supabase/server";
import { getBrandOsAccess, type BrandOsAccessStatus } from "@/lib/brand-os/access";
import { getPassivePosProductAvailability, type PassivePosProductAvailability } from "@/lib/pos/access";
import { BrandOsGuardError } from "@/lib/brand-os/server";

export type WorkspaceBrandSummary = {
  id: string;
  slug: string;
  name: string;
  accessRole: string;
  osStatus: BrandOsAccessStatus;
  pos: PassivePosProductAvailability;
};

export type UserWorkspaceContext = {
  user: { id: string; email: string | null };
  profile: null | { role: "admin" | "client" | "team"; status: "active" | "inactive"; fullName: string | null };
  isCanonicalAdmin: boolean;
  isCanonicalTeam: boolean;
  hasPendingInvitation: boolean;
  brands: WorkspaceBrandSummary[];
};

function serviceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) throw new BrandOsGuardError(500, "WORKSPACE_SERVER_CONFIG_INVALID", "Configuración de servidor incompleta.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function getUserWorkspaceContext(): Promise<UserWorkspaceContext> {
  const auth = await createServerAuthClient();
  const { data: { user }, error } = await auth.auth.getUser();
  if (error || !user) throw new BrandOsGuardError(401, "UNAUTHENTICATED", "Inicia sesión para continuar.");

  const admin = serviceClient();
  const { data: profile, error: profileError } = await admin.from("user_profiles").select("role,status,full_name").eq("user_id", user.id).maybeSingle();
  if (profileError) throw new BrandOsGuardError(500, "WORKSPACE_PROFILE_LOOKUP_FAILED", "No se pudo resolver tu perfil.");
  const normalizedProfile = profile ? { role: profile.role === "admin" ? "admin" as const : profile.role === "team" ? "team" as const : "client" as const, status: profile.status === "inactive" ? "inactive" as const : "active" as const, fullName: profile.full_name ? String(profile.full_name) : null } : null;
  const isCanonicalAdmin = normalizedProfile?.role === "admin" && normalizedProfile.status === "active";
  const isCanonicalTeam = normalizedProfile?.role === "team" && normalizedProfile.status === "active";
  if (isCanonicalAdmin || isCanonicalTeam || normalizedProfile?.status === "inactive") return { user: { id: user.id, email: user.email || null }, profile: normalizedProfile, isCanonicalAdmin, isCanonicalTeam, hasPendingInvitation: false, brands: [] };

  const normalizedEmail = user.email?.trim().toLowerCase() || null;
  const [membershipResult, invitationResult] = await Promise.all([
    admin.from("user_brand_access").select("brand_slug,access_role").eq("user_id", user.id).eq("status", "active"),
    normalizedEmail
      ? admin.from("pos_user_invitations").select("id", { count: "exact", head: true }).eq("email", normalizedEmail).eq("status", "pending").gt("expires_at", new Date().toISOString())
      : Promise.resolve({ count: 0, error: null }),
  ]);
  if (membershipResult.error) throw new BrandOsGuardError(500, "WORKSPACE_MEMBERSHIP_LOOKUP_FAILED", "No se pudieron resolver tus empresas.");
  if (invitationResult.error) throw new BrandOsGuardError(500, "WORKSPACE_INVITATION_LOOKUP_FAILED", "No se pudieron resolver tus invitaciones.");
  const memberships = membershipResult.data;
  const hasPendingInvitation = (invitationResult.count || 0) > 0;
  const roleBySlug = new Map((memberships || []).map((row) => [String(row.brand_slug), String(row.access_role)]));
  const slugs = [...roleBySlug.keys()];
  if (!slugs.length) return { user: { id: user.id, email: user.email || null }, profile: normalizedProfile, isCanonicalAdmin, isCanonicalTeam, hasPendingInvitation, brands: [] };

  const { data: brands, error: brandError } = await admin.from("brands").select("id,slug,name").in("slug", slugs).order("name");
  if (brandError) throw new BrandOsGuardError(500, "WORKSPACE_BRAND_LOOKUP_FAILED", "No se pudieron resolver tus empresas.");
  const summaries = await mapWithConcurrency(brands || [], 4, async (brand): Promise<WorkspaceBrandSummary> => ({
    id: String(brand.id), slug: String(brand.slug), name: String(brand.name), accessRole: roleBySlug.get(String(brand.slug)) || "viewer",
    osStatus: (await getBrandOsAccess(admin, String(brand.slug))).status,
    pos: await getPassivePosProductAvailability(String(brand.slug)),
  }));
  return { user: { id: user.id, email: user.email || null }, profile: normalizedProfile, isCanonicalAdmin, isCanonicalTeam, hasPendingInvitation, brands: summaries };
}

export function getWorkspaceDestination(context: Pick<UserWorkspaceContext, "profile" | "isCanonicalAdmin" | "isCanonicalTeam" | "hasPendingInvitation" | "brands">): string {
  if (context.isCanonicalTeam) return "/studio";
  if (context.profile?.status === "inactive") return "/workspace";
  if (context.isCanonicalAdmin || context.brands.length > 1) return "/workspace";
  if (context.brands.length === 0) return context.hasPendingInvitation ? "/invite" : "/onboarding/business";
  if (context.brands[0].pos.available && context.brands[0].osStatus !== "active") {
    return `/brand/${encodeURIComponent(context.brands[0].slug)}/pos`;
  }
  return `/brand/${encodeURIComponent(context.brands[0].slug)}`;
}

async function mapWithConcurrency<T, R>(values: T[], concurrency: number, mapper: (value: T) => Promise<R>): Promise<R[]> {
  const result = new Array<R>(values.length); let cursor = 0;
  async function worker() { while (cursor < values.length) { const index = cursor++; result[index] = await mapper(values[index]); } }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return result;
}
