import fs from "node:fs";

const migration = fs.readFileSync("supabase/migrations/20260902120000_cometa_studio_operation_v1.sql", "utf8");
const operation = fs.readFileSync("src/lib/studio/operation.ts", "utf8");
const api = fs.readFileSync("src/app/api/studio/operation/route.ts", "utf8");
const cosmos = fs.readFileSync("src/app/api/studio/cosmos/route.ts", "utf8");
const admin = fs.readFileSync("src/app/api/admin/access-v2/route.ts", "utf8");
const adminUi = fs.readFileSync("src/app/workspace/access/[userId]/person-actions.tsx", "utf8");
const operationUi = fs.readFileSync("src/app/studio/operation/operation-client.tsx", "utf8");
const home = fs.readFileSync("src/app/studio/page.tsx", "utf8");
const all = [migration, operation, api, cosmos, admin, adminUi, operationUi, home].join("\n");

const contracts = [
  [/cometa_studio_work_profiles/, "work profile"], [/user_id uuid NOT NULL UNIQUE/, "one profile per user"],
  [/target_minutes BETWEEN 30 AND 900/, "target bounds"], [/work_days.*ARRAY\[1,2,3,4,5,6,7\]/s, "ISO work days"],
  [/cometa_studio_operations/, "operation sessions"], [/status IN \('active','paused','closed'\)/, "status allowlist"],
  [/WHERE status IN \('active','paused'\)/, "single active operation"], [/REVOKE ALL ON public\.cometa_studio_operations FROM anon, authenticated/, "direct browser writes denied"],
  [/clock_timestamp\(\)/, "database clock authority"], [/total_paused_seconds = total_paused_seconds \+/, "pause accumulation"],
  [/unique_violation/, "double-open idempotence"], [/requireStudioAccess/, "team guard"], [/requireAdminWorkspace/, "admin guard"],
  [/profile\.data\?\.role !== "team"/, "team-only profile"], [/operation_focus/, "explicit operation focus"],
  [/operation\.status !== "active"/, "active focus guard"], [/activeMinutesToday.*remainingMinutes.*targetMinutes.*expectedEndAt.*targetReached/s, "minimal COSMOS context"],
  [/No estimes cuánto tarda una pieza o grupo de piezas/, "no fabricated task duration prompt"], [/priorityRank/, "real priority signal"],
  [/Planear mi operación con COSMOS/, "manual AI action"], [/Historial reciente/, "own history UI"],
  [/required: \["focusNow", "next", "avoidStarting", "summary"\]/, "all focus properties required"],
  [/focusNow: \{ anyOf: \[pieceSchema\(\), \{ type: "null" \}\] \}/, "nullable focusNow schema"],
  [/avoidStarting: FocusPiece\[\]/, "required avoidStarting TypeScript contract"],
  [/COSMOS_FOCUS_DUPLICATE_ID/, "duplicate ID rejection"], [/returnedPiece\.title = allowed\.get/, "canonical title replacement"],
  [/\[STUDIO_OPERATION_FOCUS_REQUEST\]/, "safe request logging"], [/\[STUDIO_OPERATION_FOCUS_CONTEXT\]/, "safe context logging"],
  [/\[STUDIO_OPERATION_FOCUS_AI_VALIDATED\]/, "safe validation logging"], [/\[STUDIO_OPERATION_FOCUS_FAILED\]/, "safe failure logging"],
  [/No hay una prioridad adicional que COSMOS necesite destacar ahora/, "null focus UI"],
  [/if \(!body\.pieceId\).*PIECE_AND_ACTION_INVALID/, "piece Creator contract preserved"],
];
for (const [pattern, label] of contracts) if (!pattern.test(all)) throw new Error(`Missing contract: ${label}`);
if (/userId.*body|openedAt|closedAt|pausedSeconds/.test(api)) throw new Error("Browser authority field detected in Team API");
if (/setInterval\s*\(\s*\(\)\s*=>\s*fetch|useEffect\s*\([^)]*operation_focus/s.test(all)) throw new Error("Automatic COSMOS call or aggressive polling detected");
if (/payroll|overtime|retardo|puntualidad|GPS|screenshot|productivity score/i.test([operationUi, home, cosmos].join("\n"))) throw new Error("Disallowed language detected");
const logLines = cosmos.split("\n").filter((line) => /STUDIO_OPERATION_FOCUS_/.test(line) && /console\./.test(line));
if (logLines.some((line) => /apiKey|OPENAI_API_KEY|prompt|messages|privateNotes|signedUrl/i.test(line))) throw new Error("Sensitive operation focus logging detected");

function hasInventedTaskDuration(text) { const duration = /\b\d+(?:[.,]\d+)?\s*(?:h|hrs?|horas?|min(?:uto)?s?)\b/i; const task = /\b(?:pieza|piezas|reel|reels|story|stories|post|posts|carousel|carrusel|carruseles|tarea|tareas|trabajo|trabajos|task|tasks)\b/i; const estimate = /\b(?:toma|tomará|tomaría|tarda|tardará|tardaría|lleva|llevará|llevaría|acabar|terminar|completar|hacer|producir|puedes\s+acabar|puedes\s+terminar)(?=\s|$)/i; return text.split(/[.!?;\n]+/).some((sentence) => duration.test(sentence) && task.test(sentence) && estimate.test(sentence)); }
if (hasInventedTaskDuration("Te quedan aproximadamente 8 horas de operación.")) throw new Error("Real operation duration rejected");
if (hasInventedTaskDuration("Tu tiempo restante real es de 480 minutos.")) throw new Error("Real remaining time rejected");
if (!hasInventedTaskDuration("Este reel tomará 45 minutos.")) throw new Error("Task duration estimate accepted");
if (!hasInventedTaskDuration("La story tarda 20 minutos.")) throw new Error("Story duration estimate accepted");
if (!hasInventedTaskDuration("Puedes acabar estas tres piezas en 2 horas.")) throw new Error("Group duration estimate accepted");

function validateFocus(result, canonical) { const returned = [...(result.focusNow ? [result.focusNow] : []), ...result.next, ...result.avoidStarting]; if (returned.some((item) => !canonical.has(item.pieceId))) return "unknown"; if (new Set(returned.map((item) => item.pieceId)).size !== returned.length) return "duplicate"; for (const item of returned) item.title = canonical.get(item.pieceId); return "valid"; }
const canonical = new Map([["piece-1", "Título canónico"], ["piece-2", "Siguiente"]]);
const nullFocus = { focusNow: null, next: [{ pieceId: "piece-1", title: "Inventado", reason: "Prioridad real" }], avoidStarting: [], summary: "Resumen" };
if (validateFocus(nullFocus, canonical) !== "valid" || nullFocus.next[0].title !== "Título canónico") throw new Error("Null focus or canonical title validation failed");
if (validateFocus({ focusNow: null, next: [{ pieceId: "unknown", title: "X", reason: "X" }], avoidStarting: [], summary: "X" }, canonical) !== "unknown") throw new Error("Unknown ID accepted");
if (validateFocus({ focusNow: { pieceId: "piece-1", title: "X", reason: "X" }, next: [{ pieceId: "piece-1", title: "X", reason: "X" }], avoidStarting: [], summary: "X" }, canonical) !== "duplicate") throw new Error("Duplicate ID accepted");

function state(sessions, targetMinutes, now) {
  const totals = sessions.reduce((sum, session) => { const end = session.closedAt ?? now; const currentPause = session.pausedAt ? (now - session.pausedAt) / 1000 : 0; const paused = session.pausedSeconds + currentPause; return { active: sum.active + Math.max(0, (end - session.openedAt) / 1000 - paused), paused: sum.paused + paused }; }, { active: 0, paused: 0 });
  const remaining = Math.max(0, targetMinutes * 60 - totals.active);
  return { ...totals, remaining, expectedEnd: now + remaining * 1000 };
}
const hour = 3_600_000;
if (state([{ openedAt: 15 * hour, closedAt: null, pausedAt: null, pausedSeconds: 0 }], 240, 15 * hour).expectedEnd !== 19 * hour) throw new Error("Early-start expected end failed");
if (state([{ openedAt: 17 * hour, closedAt: null, pausedAt: null, pausedSeconds: 0 }], 240, 17 * hour).expectedEnd !== 21 * hour) throw new Error("Late-start expected end failed");
const multiple = state([{ openedAt: 15 * hour, closedAt: 17 * hour, pausedAt: null, pausedSeconds: 0 }, { openedAt: 17.5 * hour, closedAt: null, pausedAt: null, pausedSeconds: 0 }], 240, 17.5 * hour);
if (multiple.active !== 2 * 3600 || multiple.expectedEnd !== 19.5 * hour) throw new Error("Multiple-session aggregation failed");
const paused = state([{ openedAt: 15 * hour, closedAt: null, pausedAt: 16 * hour, pausedSeconds: 0 }], 240, 17 * hour);
if (paused.active !== 3600 || paused.paused !== 3600 || paused.expectedEnd !== 20 * hour) throw new Error("Pause exclusion/extension failed");
if (state([{ openedAt: 10 * hour, closedAt: null, pausedAt: null, pausedSeconds: 0 }], 240, 15 * hour).remaining !== 0) throw new Error("Remaining became negative");
console.log("Studio Operation V1 static and calculation contracts: PASS");
console.log("No database, network, Supabase push, or live writes were executed.");
