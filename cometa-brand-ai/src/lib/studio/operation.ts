import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { BrandOsGuardError } from "@/lib/brand-os/server";
import { requireStudioAccess } from "@/lib/studio/server";
import { requireAdminWorkspace } from "@/lib/workspace/admin-brands";

export type StudioOperationStatus = "off" | "active" | "paused" | "closed";
export type StudioWorkProfile = {
  typicalStart: string | null;
  targetMinutes: number;
  workDays: number[] | null;
  timezone: string;
};
export type StudioOperationHistoryDay = {
  operationDate: string;
  firstOpenedAt: string;
  lastClosedAt: string | null;
  activeMinutes: number;
};
export type StudioOperationState = {
  asOf: string;
  profileConfigured: boolean;
  status: StudioOperationStatus;
  operationDate: string;
  timezone: string;
  typicalStart: string | null;
  targetMinutes: number | null;
  firstOpenedAt: string | null;
  currentSessionOpenedAt: string | null;
  lastClosedAt: string | null;
  activeMinutesToday: number;
  pausedMinutesToday: number;
  remainingMinutes: number;
  expectedEndAt: string | null;
  targetReached: boolean;
  history: StudioOperationHistoryDay[];
};

type OperationRow = {
  id: string;
  operation_date: string;
  timezone_snapshot: string;
  typical_start_snapshot: string | null;
  target_minutes_snapshot: number;
  status: "active" | "paused" | "closed";
  opened_at: string;
  paused_at: string | null;
  total_paused_seconds: number;
  closed_at: string | null;
};

const OPERATION_FIELDS = "id,operation_date,timezone_snapshot,typical_start_snapshot,target_minutes_snapshot,status,opened_at,paused_at,total_paused_seconds,closed_at";

function db(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) throw new BrandOsGuardError(500, "STUDIO_SERVER_CONFIG_INVALID", "Configuración de Studio incompleta.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function validTimezone(value: string): boolean {
  try { new Intl.DateTimeFormat("en-US", { timeZone: value }).format(); return true; } catch { return false; }
}

function localDate(timezone: string, instant = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(instant);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function sessionSeconds(row: OperationRow, nowMs: number): { active: number; paused: number } {
  const openedMs = Date.parse(row.opened_at);
  const endMs = row.closed_at ? Date.parse(row.closed_at) : nowMs;
  const currentPause = row.status === "paused" && row.paused_at ? Math.max(0, Math.floor((nowMs - Date.parse(row.paused_at)) / 1000)) : 0;
  const paused = Math.max(0, Number(row.total_paused_seconds) || 0) + currentPause;
  return { active: Math.max(0, Math.floor((endMs - openedMs) / 1000) - paused), paused };
}

function profileFromRow(row: Record<string, unknown>): StudioWorkProfile {
  return {
    typicalStart: typeof row.typical_start_time === "string" ? row.typical_start_time : null,
    targetMinutes: Number(row.target_minutes),
    workDays: Array.isArray(row.work_days) ? row.work_days.map(Number) : null,
    timezone: String(row.timezone),
  };
}

export async function getStudioWorkProfile(userId: string): Promise<StudioWorkProfile | null> {
  const result = await db().from("cometa_studio_work_profiles").select("typical_start_time,target_minutes,work_days,timezone").eq("user_id", userId).maybeSingle();
  if (result.error) throw new BrandOsGuardError(500, "OPERATION_PROFILE_LOOKUP_FAILED", "No se pudo cargar la jornada operativa.");
  return result.data ? profileFromRow(result.data as Record<string, unknown>) : null;
}

export async function saveStudioWorkProfile(userId: string, input: StudioWorkProfile): Promise<StudioWorkProfile> {
  const actor = await requireAdminWorkspace();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) throw new Error("USER_ID_INVALID");
  if (!Number.isInteger(input.targetMinutes) || input.targetMinutes < 30 || input.targetMinutes > 900) throw new Error("OPERATION_TARGET_INVALID");
  if (!validTimezone(input.timezone)) throw new Error("OPERATION_TIMEZONE_INVALID");
  if (input.typicalStart !== null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.typicalStart)) throw new Error("OPERATION_TYPICAL_START_INVALID");
  const workDays = input.workDays === null ? null : [...new Set(input.workDays)].sort((a, b) => a - b);
  if (workDays && workDays.some((day) => !Number.isInteger(day) || day < 1 || day > 7)) throw new Error("OPERATION_WORK_DAYS_INVALID");
  const client = db();
  const profile = await client.from("user_profiles").select("role").eq("user_id", userId).maybeSingle();
  if (profile.error) throw new Error("TEAM_PROFILE_LOOKUP_FAILED");
  if (profile.data?.role !== "team") throw new Error("TEAM_PROFILE_REQUIRED");
  const result = await client.from("cometa_studio_work_profiles").upsert({
    user_id: userId,
    typical_start_time: input.typicalStart,
    target_minutes: input.targetMinutes,
    work_days: workDays,
    timezone: input.timezone,
    created_by: actor.userId,
    updated_by: actor.userId,
  }, { onConflict: "user_id" }).select("typical_start_time,target_minutes,work_days,timezone").single();
  if (result.error || !result.data) throw new Error("OPERATION_PROFILE_SAVE_FAILED");
  return profileFromRow(result.data as Record<string, unknown>);
}

export async function getStudioOperationState(userId: string): Promise<StudioOperationState> {
  const profile = await getStudioWorkProfile(userId);
  const timezone = profile?.timezone || "America/Mexico_City";
  const today = localDate(timezone);
  const result = await db().from("cometa_studio_operations").select(OPERATION_FIELDS).eq("user_id", userId).order("operation_date", { ascending: false }).order("opened_at", { ascending: true }).limit(200);
  if (result.error) throw new BrandOsGuardError(500, "OPERATION_LOOKUP_FAILED", "No se pudo cargar tu operación.");
  const rows = (result.data || []) as OperationRow[];
  const current = rows.find((row) => row.status === "active" || row.status === "paused") || null;
  const operationDate = current?.operation_date || today;
  const todayRows = rows.filter((row) => row.operation_date === operationDate);
  const nowMs = Date.now();
  const totals = todayRows.reduce((sum, row) => { const value = sessionSeconds(row, nowMs); return { active: sum.active + value.active, paused: sum.paused + value.paused }; }, { active: 0, paused: 0 });
  const targetMinutes = todayRows[0]?.target_minutes_snapshot ?? profile?.targetMinutes ?? null;
  const remainingSeconds = targetMinutes === null ? 0 : Math.max(0, targetMinutes * 60 - totals.active);
  const lastClosed = [...todayRows].reverse().find((row) => row.closed_at)?.closed_at || null;
  const grouped = new Map<string, OperationRow[]>();
  for (const row of rows) grouped.set(row.operation_date, [...(grouped.get(row.operation_date) || []), row]);
  const history = [...grouped.entries()].sort(([a], [b]) => b.localeCompare(a)).slice(0, 7).map(([date, dayRows]) => {
    const seconds = dayRows.reduce((sum, row) => sum + sessionSeconds(row, nowMs).active, 0);
    return { operationDate: date, firstOpenedAt: dayRows[0].opened_at, lastClosedAt: [...dayRows].reverse().find((row) => row.closed_at)?.closed_at || null, activeMinutes: Math.floor(seconds / 60) };
  });
  return {
    asOf: new Date(nowMs).toISOString(),
    profileConfigured: profile !== null,
    status: current?.status || (todayRows.length ? "closed" : "off"),
    operationDate,
    timezone: current?.timezone_snapshot || timezone,
    typicalStart: current?.typical_start_snapshot ?? profile?.typicalStart ?? null,
    targetMinutes,
    firstOpenedAt: todayRows[0]?.opened_at || null,
    currentSessionOpenedAt: current?.opened_at || null,
    lastClosedAt: lastClosed,
    activeMinutesToday: Math.floor(totals.active / 60),
    pausedMinutesToday: Math.floor(totals.paused / 60),
    remainingMinutes: Math.ceil(remainingSeconds / 60),
    expectedEndAt: current ? new Date(nowMs + remainingSeconds * 1000).toISOString() : null,
    targetReached: targetMinutes !== null && totals.active >= targetMinutes * 60,
    history,
  };
}

export async function getOwnStudioOperationState(): Promise<StudioOperationState> {
  const studio = await requireStudioAccess();
  return getStudioOperationState(studio.userId);
}

export async function transitionOwnStudioOperation(action: "open" | "pause" | "resume" | "close"): Promise<StudioOperationState> {
  const studio = await requireStudioAccess();
  const result = await db().rpc("cometa_studio_operation_transition_v1", { p_user_id: studio.userId, p_action: action });
  if (result.error) {
    const message = result.error.message.includes("OPERATION_PROFILE_REQUIRED") ? "OPERATION_PROFILE_REQUIRED" : result.error.message.includes("OPERATION_NOT_OPEN") ? "OPERATION_NOT_OPEN" : "OPERATION_TRANSITION_FAILED";
    throw new BrandOsGuardError(message === "OPERATION_PROFILE_REQUIRED" ? 409 : 400, message, message === "OPERATION_PROFILE_REQUIRED" ? "Tu jornada operativa todavía no está configurada." : "No se pudo actualizar tu operación.");
  }
  return getStudioOperationState(studio.userId);
}
