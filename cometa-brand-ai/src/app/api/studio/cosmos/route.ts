import OpenAI from "openai";
import { NextResponse } from "next/server";
import { getBrandProductionProfile, getProductionCapabilities } from "@/lib/studio/production";
import { getStudioOperationState } from "@/lib/studio/operation";
import { getStudioPiece, getStudioWorkspaceData, requireStudioAccess, requireStudioBrandAccess } from "@/lib/studio/server";

const ACTIONS = ["script", "shots", "hooks", "cta", "production_brief", "shot_plan", "freeform", "operation_focus"] as const;
type Action = (typeof ACTIONS)[number];
type FocusPiece = { pieceId: string; title: string; reason: string };
type FocusResult = { focusNow: FocusPiece | null; next: FocusPiece[]; avoidStarting: FocusPiece[]; summary: string };
type ShotPlanShot = { order: number; label: string; shotType: string; action: string; visual: string; dialogueOrText: string | null; notes: string | null };
type ShotPlanResult = { summary: string; creativeApproach: string; shots: ShotPlanShot[]; resources: Array<{ name: string; source: "confirmed" | "piece_context" }>; checklist: string[]; warnings: string[] };

export async function POST(request: Request) {
  let operationFocus = false;
  let operationFocusStage = "request";
  let shotPlan = false;
  let shotPlanStage = "request";
  try {
    const studio = await requireStudioAccess();
    const body = await request.json() as { pieceId?: string; action?: string; freeformQuestion?: string };
    const action = String(body.action || "") as Action;
    if (!ACTIONS.includes(action)) return NextResponse.json({ ok: false, error: "COSMOS_ACTION_INVALID" }, { status: 400 });
    operationFocus = action === "operation_focus";
    shotPlan = action === "shot_plan";
    if (shotPlan) console.info("[STUDIO_SHOT_PLAN_REQUEST]", { action: "shot_plan", pieceIdPresent: typeof body.pieceId === "string" && body.pieceId.length > 0 });
    if (operationFocus) console.info("[STUDIO_OPERATION_FOCUS_REQUEST]", { action: "operation_focus", authenticated: true });
    const key = process.env.OPENAI_API_KEY;
    if (!key) return NextResponse.json({ ok: false, error: "COSMOS_UNAVAILABLE" }, { status: 503 });
    const openai = new OpenAI({ apiKey: key });

    if (action === "operation_focus") {
      operationFocusStage = "context";
      const [operation, workspace] = await Promise.all([getStudioOperationState(studio.userId), getStudioWorkspaceData(studio)]);
      if (operation.status !== "active") return NextResponse.json({ ok: false, error: "OPERATION_ACTIVE_REQUIRED", message: "Abre tu operación para planearla con COSMOS." }, { status: 409 });
      const assignedItems = workspace.items as Array<Record<string, unknown>>;
      const assignedBrandSlugs = [...new Set(assignedItems.map((item) => String(item.brand_slug || "")).filter(Boolean))];
      const authorizedBrands = await Promise.all(assignedBrandSlugs.map((brandSlug) => requireStudioBrandAccess(brandSlug)));
      const allowedBrandSlugs = new Set(authorizedBrands.map((access) => access.brand.slug));
      const excluded = new Set(["approved_client", "scheduled", "published", "analyzed", "cancelled"]);
      const priorityRank: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
      const eligibleItems = assignedItems.filter((item) => allowedBrandSlugs.has(String(item.brand_slug)) && !excluded.has(String(item.status)));
      const pieces = eligibleItems.sort((a, b) => {
        const change = Number(b.status === "changes_requested") - Number(a.status === "changes_requested");
        if (change) return change;
        const rank = (priorityRank[String(a.priority)] ?? 2) - (priorityRank[String(b.priority)] ?? 2);
        if (rank) return rank;
        return String(a.due_date || a.publish_date || "9999-12-31").localeCompare(String(b.due_date || b.publish_date || "9999-12-31"));
      }).slice(0, 12).map((item) => ({ pieceId: String(item.id), title: String(item.title || "Sin título"), status: String(item.status), dueDate: item.due_date || null, publishDate: item.publish_date || null, distributionType: item.distribution_type || null, priority: item.priority || "normal", changesRequested: item.status === "changes_requested" }));
      if (!pieces.length) return NextResponse.json({ ok: false, error: "OPERATION_FOCUS_EMPTY", message: "No hay trabajo asignado pendiente para planear." }, { status: 409 });
      const operationContext = { operationStatus: operation.status, activeMinutesToday: operation.activeMinutesToday, remainingMinutes: operation.remainingMinutes, targetMinutes: operation.targetMinutes, expectedEndAt: operation.expectedEndAt, targetReached: operation.targetReached };
      console.info("[STUDIO_OPERATION_FOCUS_CONTEXT]", { operationStatus: operation.status, activeMinutesToday: operation.activeMinutesToday, remainingMinutes: operation.remainingMinutes, targetMinutes: operation.targetMinutes, assignedPieceCount: assignedItems.length, eligiblePieceCount: eligibleItems.length });
      operationFocusStage = "openai";
      const response = await openai.chat.completions.create({ model: process.env.OPENAI_MODEL || "gpt-4o-mini", temperature: 0.2, messages: [
        { role: "system", content: "Eres COSMOS para operación creativa. Prioriza únicamente piezas incluidas. Usa estado, fechas, distributionType, priority y changesRequested. El tiempo operativo restante solo orienta el orden. Puedes mencionar únicamente tiempos proporcionados explícitamente en el contexto operacional. No estimes cuánto tarda una pieza o grupo de piezas, ni inventes velocidad, cantidad realizable o capacidad exacta. Devuelve exclusivamente JSON que cumpla el esquema. Si no existe un foco claro, focusNow debe ser null. avoidStarting siempre debe ser un array, aunque esté vacío." },
        { role: "user", content: JSON.stringify({ operation: operationContext, assignedWork: pieces }) },
      ], response_format: { type: "json_schema", json_schema: { name: "operation_focus", strict: true, schema: { type: "object", additionalProperties: false, required: ["focusNow", "next", "avoidStarting", "summary"], properties: { focusNow: { anyOf: [pieceSchema(), { type: "null" }] }, next: { type: "array", items: pieceSchema(), maxItems: 4 }, avoidStarting: { type: "array", items: pieceSchema(), maxItems: 3 }, summary: { type: "string" } } } } } });
      operationFocusStage = "parse";
      const content = response.choices[0]?.message.content;
      if (!content) throw new Error("COSMOS_EMPTY_OUTPUT");
      const parsed: unknown = JSON.parse(content);
      if (!isFocusResult(parsed)) throw new Error("COSMOS_FOCUS_SHAPE_INVALID");
      const result = parsed;
      operationFocusStage = "validate";
      const allowed = new Map(pieces.map((piece) => [piece.pieceId, piece.title]));
      const returned = [...(result.focusNow ? [result.focusNow] : []), ...result.next, ...result.avoidStarting];
      if (returned.some((piece) => !allowed.has(piece.pieceId))) throw new Error("COSMOS_FOCUS_ID_INVALID");
      if (new Set(returned.map((piece) => piece.pieceId)).size !== returned.length) throw new Error("COSMOS_FOCUS_DUPLICATE_ID");
      if ([...returned.map((piece) => piece.reason), result.summary].some(hasInventedTaskDuration)) throw new Error("COSMOS_FOCUS_TASK_DURATION_INVALID");
      for (const returnedPiece of returned) returnedPiece.title = allowed.get(returnedPiece.pieceId) || returnedPiece.title;
      console.info("[STUDIO_OPERATION_FOCUS_AI_VALIDATED]", { focusNowPresent: result.focusNow !== null, nextCount: result.next.length, avoidStartingCount: result.avoidStarting.length });
      return NextResponse.json({ ok: true, result });
    }

    if (shotPlan) shotPlanStage = "piece_validation";
    if (!body.pieceId) return NextResponse.json({ ok: false, error: "PIECE_AND_ACTION_INVALID" }, { status: 400 });
    const piece = await getStudioPiece(studio, body.pieceId);
    if (!piece) return NextResponse.json({ ok: false, error: "PIECE_NOT_FOUND" }, { status: 404 });
    if (shotPlan) shotPlanStage = "brand_authorization";
    const access = await requireStudioBrandAccess(String(piece.brand_slug));
    if (shotPlan) shotPlanStage = "production_context";
    const [capabilities, productionProfile] = shotPlan ? await Promise.all([getProductionCapabilities(access.brand.slug), getBrandProductionProfile(access.brand.slug)]) : [await getProductionCapabilities(access.brand.slug), null];
    if (shotPlan) console.info("[STUDIO_SHOT_PLAN_CONTEXT]", { pieceIdPresent: true, contentType: piece.content_type || null, distributionType: piece.distribution_type || null, productionProfilePresent: productionProfile !== null, agencyModelAllowed: capabilities.canUseAgencyModel, clientModelAvailable: capabilities.canUseClientModel, handsAllowed: capabilities.canUseHands, productOnlyAllowed: capabilities.canUseProductOnly });
    if (shotPlan) shotPlanStage = "openai";
    const confirmedResources = shotPlan && productionProfile ? [productionProfile.agencyModelAllowed && !productionProfile.noHumanTalent ? "Modelo Cometa" : null, productionProfile.clientModelAvailable && !productionProfile.noHumanTalent ? "Modelo del cliente" : null, productionProfile.handsAllowed ? "Manos" : null, productionProfile.productOnlyAllowed ? "Producción solo con producto" : null, recordingLocationResource(productionProfile.recordingLocationType)].filter((resource): resource is string => Boolean(resource)) : [];
    const confirmedTalent = shotPlan && productionProfile && !productionProfile.noHumanTalent ? [productionProfile.agencyModelAllowed ? "Modelo Cometa" : null, productionProfile.clientModelAvailable ? "Modelo del cliente" : null].filter((resource): resource is string => Boolean(resource)) : [];
    const shotPlanPolicy = shotPlan ? { productionProfilePresent: productionProfile !== null, confirmedTalent, handsConfirmed: productionProfile?.handsAllowed === true, productOnlyAllowed: productionProfile?.productOnlyAllowed === true, physicalProductAvailable: false, testimonialMaterialConfirmed: false, confirmedLocation: recordingLocationResource(productionProfile?.recordingLocationType || null) } : null;
    const creativePieceContext = shotPlan ? { title: piece.title || null, objective: piece.objective || null, brief: piece.brief || null, cta: piece.cta || null, visualDirection: piece.visual_direction || null, contentType: piece.content_type || null, platform: piece.platform || null, distributionType: piece.distribution_type || null } : piece;
    const response = await openai.chat.completions.create({ model: process.env.OPENAI_MODEL || "gpt-4o-mini", temperature: 0.3, messages: [
      { role: "system", content: shotPlan ? "Eres COSMOS Creator para producción audiovisual. Genera un Shot Plan accionable en español, no una ficha de contenido. Trata las capacidades de producción como hechos únicamente cuando estén explícitamente confirmadas. La ausencia de Production Profile significa DESCONOCIDO: nunca significa disponibilidad ni permiso para inventar recursos. Cada toma debe indicar orden, función, tipo de plano, acción, visual y texto o diálogo cuando aplique. Usa únicamente recursos incluidos en confirmedResources. Nunca inventes talento, clientes, narradoras, modelos, revendedoras, testimonios, disponibilidad de producto físico, manos, locaciones, estudio, tienda, utilería, permisos, horarios o reservas. Si una dirección depende de un recurso no confirmado, produce primero una alternativa independiente del recurso o expresa la condición con 'si se confirma' y agrega la dependencia a warnings. No atribuyas citas ni experiencias a personas reales sin material testimonial confirmado. Puedes proponer close-up, plano detalle, cenital, POV conceptual, motion graphics, texto, gráficos, cortes rápidos y overlays. Si productOnlyAllowed es true, prioriza close-ups, cenitales, planos detalle y motion o texto; esa capacidad no confirma que el producto físico esté disponible. Si handsConfirmed es false, no conviertas manos en un recurso operativo. El talento confirmado debe nombrarse exactamente como Modelo Cometa o Modelo del cliente. No inventes duraciones de producción. No devuelvas IDs, assigned_to, priority, status, fechas técnicas ni metadata interna. Devuelve todo el texto en español y cumple exclusivamente el schema." : "COSMOS Creator produce recomendaciones estructuradas y seguras. No inventes disponibilidad, productos, reservas, promociones ni horarios." },
      { role: "user", content: JSON.stringify(shotPlan ? { action: "shot_plan", brandName: access.brand.name, piece: creativePieceContext, productionPolicy: shotPlanPolicy, confirmedResources } : { action, question: body.freeformQuestion || null, piece, brand: access.brand.name, capabilities }) },
    ], response_format: shotPlan ? { type: "json_schema", json_schema: { name: "studio_shot_plan", strict: true, schema: shotPlanSchema() } } : { type: "json_object" } });
    if (shotPlan) shotPlanStage = "parse";
    const content = response.choices[0]?.message.content;
    if (!content) throw new Error("COSMOS_EMPTY_OUTPUT");
    const parsed = JSON.parse(content) as unknown;
    if (shotPlan) { shotPlanStage = "validate"; if (!isShotPlanResult(parsed)) throw new Error("COSMOS_SHOT_PLAN_SHAPE_INVALID"); const allowedResources = new Set(confirmedResources); if (parsed.resources.some((resource) => resource.source !== "confirmed" || !allowedResources.has(resource.name))) throw new Error("COSMOS_SHOT_PLAN_RESOURCE_INVALID"); if (parsed.shots.some((shot, index) => shot.order !== index + 1)) throw new Error("COSMOS_SHOT_PLAN_ORDER_INVALID"); if (!productionProfile && parsed.resources.length !== 0) throw new Error("COSMOS_SHOT_PLAN_PROFILE_NULL_RESOURCE_INVALID"); if (!productionProfile && parsed.warnings.length === 0) throw new Error("COSMOS_SHOT_PLAN_WARNING_REQUIRED"); if (shotPlanText(parsed).some(hasShotPlanDuration)) throw new Error("COSMOS_SHOT_PLAN_DURATION_INVALID"); const unconfirmedResourceViolation = hasUnconfirmedResourceClaim(parsed, { talent: shotPlanPolicy?.confirmedTalent || [], hands: shotPlanPolicy?.handsConfirmed === true, location: Boolean(shotPlanPolicy?.confirmedLocation) }); if (unconfirmedResourceViolation) throw new Error("COSMOS_SHOT_PLAN_UNCONFIRMED_RESOURCE"); console.info("[STUDIO_SHOT_PLAN_AI_VALIDATED]", { shotsCount: parsed.shots.length, resourcesCount: parsed.resources.length, checklistCount: parsed.checklist.length, warningsCount: parsed.warnings.length, productionProfilePresent: productionProfile !== null, unconfirmedResourceViolation: false }); }
    return NextResponse.json({ ok: true, result: parsed });
  } catch (error) {
    if (operationFocus) console.error("[STUDIO_OPERATION_FOCUS_FAILED]", safeOperationFocusError(operationFocusStage, error));
    if (shotPlan) console.error("[STUDIO_SHOT_PLAN_FAILED]", safeOperationFocusError(shotPlanStage, error));
    return NextResponse.json({ ok: false, error: "COSMOS_REQUEST_FAILED", message: "COSMOS no pudo preparar la recomendación." }, { status: 400 });
  }
}

function pieceSchema() { return { type: "object", additionalProperties: false, required: ["pieceId", "title", "reason"], properties: { pieceId: { type: "string" }, title: { type: "string" }, reason: { type: "string" } } }; }
function shotPlanSchema() { const nullableString = { anyOf: [{ type: "string" }, { type: "null" }] }; return { type: "object", additionalProperties: false, required: ["summary", "creativeApproach", "shots", "resources", "checklist", "warnings"], properties: { summary: { type: "string" }, creativeApproach: { type: "string" }, shots: { type: "array", minItems: 3, maxItems: 10, items: { type: "object", additionalProperties: false, required: ["order", "label", "shotType", "action", "visual", "dialogueOrText", "notes"], properties: { order: { type: "integer", minimum: 1, maximum: 10 }, label: { type: "string" }, shotType: { type: "string" }, action: { type: "string" }, visual: { type: "string" }, dialogueOrText: nullableString, notes: nullableString } } }, resources: { type: "array", items: { type: "object", additionalProperties: false, required: ["name", "source"], properties: { name: { type: "string" }, source: { type: "string", enum: ["confirmed", "piece_context"] } } } }, checklist: { type: "array", items: { type: "string" } }, warnings: { type: "array", items: { type: "string" } } } }; }
function isFocusPiece(value: unknown): value is FocusPiece { if (!value || typeof value !== "object" || Array.isArray(value)) return false; const row = value as Record<string, unknown>; return Object.keys(row).length === 3 && typeof row.pieceId === "string" && typeof row.title === "string" && typeof row.reason === "string"; }
function isFocusResult(value: unknown): value is FocusResult { if (!value || typeof value !== "object" || Array.isArray(value)) return false; const row = value as Record<string, unknown>; return Object.keys(row).length === 4 && (row.focusNow === null || isFocusPiece(row.focusNow)) && Array.isArray(row.next) && row.next.every(isFocusPiece) && Array.isArray(row.avoidStarting) && row.avoidStarting.every(isFocusPiece) && typeof row.summary === "string"; }
function isShotPlanShot(value: unknown): value is ShotPlanShot { if (!value || typeof value !== "object" || Array.isArray(value)) return false; const row = value as Record<string, unknown>; return Object.keys(row).length === 7 && Number.isInteger(row.order) && typeof row.label === "string" && typeof row.shotType === "string" && typeof row.action === "string" && typeof row.visual === "string" && (row.dialogueOrText === null || typeof row.dialogueOrText === "string") && (row.notes === null || typeof row.notes === "string"); }
function isShotPlanResult(value: unknown): value is ShotPlanResult { if (!value || typeof value !== "object" || Array.isArray(value)) return false; const row = value as Record<string, unknown>; return Object.keys(row).length === 6 && typeof row.summary === "string" && typeof row.creativeApproach === "string" && Array.isArray(row.shots) && row.shots.length >= 3 && row.shots.length <= 10 && row.shots.every(isShotPlanShot) && Array.isArray(row.resources) && row.resources.every((resource) => Boolean(resource) && typeof resource === "object" && !Array.isArray(resource) && Object.keys(resource).length === 2 && typeof resource.name === "string" && ["confirmed", "piece_context"].includes(String(resource.source))) && Array.isArray(row.checklist) && row.checklist.every((item) => typeof item === "string") && Array.isArray(row.warnings) && row.warnings.every((item) => typeof item === "string"); }
function shotPlanText(result: ShotPlanResult) { return [result.summary, result.creativeApproach, ...result.shots.flatMap((shot) => [shot.label, shot.shotType, shot.action, shot.visual, shot.dialogueOrText || "", shot.notes || ""]), ...result.resources.map((resource) => resource.name), ...result.checklist, ...result.warnings]; }
function hasShotPlanDuration(text: string) { return /\b\d+(?:[.,]\d+)?\s*(?:h|hrs?|horas?|min(?:uto)?s?)\b/i.test(text); }
function recordingLocationResource(value: string | null) { return value === "client_location" ? "Ubicación habitual: instalaciones del cliente" : value === "cometa_location" ? "Ubicación habitual: instalaciones de Cometa" : value === "external_location" ? "Ubicación habitual: locación externa confirmada" : null; }
function hasUnconfirmedResourceClaim(result: ShotPlanResult, policy: { talent: string[]; hands: boolean; location: boolean }) {
  const conditional = /\b(?:si\s+(?:se\s+)?confirma|si\s+está\s+disponible|requiere\s+confirmar|confirmar\s+disponibilidad|en\s+caso\s+de\s+confirmarse|opcional)\b/i;
  const talent = /\b(?:narrador(?:a)?|revendedor(?:a)?|modelo|cliente\s+(?:habla|presenta|cuenta|comparte)|persona\s+(?:habla|presenta|sostiene))\b/i;
  const hands = /\b(?:mano|manos|sostiene|sostener)\b/i;
  const location = /\b(?:en\s+la\s+tienda|en\s+el\s+estudio|en\s+el\s+salón|sobre\s+el\s+mostrador)\b/i;
  const physicalProduct = /\b(?:producto\s+físico|producto\s+en\s+la\s+mano|sostiene\s+el\s+producto|mostrar\s+el\s+producto|presentar\s+el\s+producto|(?:close-up|plano\s+detalle|cenital)\s+(?:del|de\s+un)\s+producto)\b/i;
  const testimonial = /\b(?:desde\s+que|mi\s+experiencia|mis\s+ventas|me\s+funcionó|yo\s+vendo|testimonio\s+real)\b/i;
  const violates = (text: string) => {
    if (!text.trim()) return false;
    if (testimonial.test(text)) return true;
    const hasCondition = conditional.test(text);
    if (physicalProduct.test(text) && !(hasCondition && /\bproducto\b/i.test(text))) return true;
    if (!policy.hands && hands.test(text) && !(hasCondition && /\bmanos?\b/i.test(text))) return true;
    if (!policy.location && location.test(text) && !(hasCondition && /\b(?:locación|tienda|estudio|salón|mostrador)\b/i.test(text))) return true;
    if (!talent.test(text) || (hasCondition && /\b(?:talento|narrador(?:a)?|revendedor(?:a)?|modelo|cliente|persona)\b/i.test(text))) return false;
    if (policy.talent.includes("Modelo Cometa") && /\bModelo Cometa\b/i.test(text)) return false;
    if (policy.talent.includes("Modelo del cliente") && /\bmodelo del cliente\b/i.test(text)) return false;
    return true;
  };
  const generalClaims = [result.summary, result.creativeApproach, ...result.checklist];
  if (generalClaims.some((claim) => claim.split(/[.!?;\n]+/).some((sentence) => violates(sentence)))) return true;
  return result.shots.some((shot) => {
    const shotText = [shot.action, shot.visual, shot.dialogueOrText || "", shot.notes || ""].join(". ");
    return violates(shotText);
  });
}
function hasInventedTaskDuration(text: string): boolean { const duration = /\b\d+(?:[.,]\d+)?\s*(?:h|hrs?|horas?|min(?:uto)?s?)\b/i; const task = /\b(?:pieza|piezas|reel|reels|story|stories|post|posts|carousel|carrusel|carruseles|tarea|tareas|trabajo|trabajos|task|tasks)\b/i; const estimate = /\b(?:toma|tomará|tomaría|tarda|tardará|tardaría|lleva|llevará|llevaría|acabar|terminar|completar|hacer|producir|puedes\s+acabar|puedes\s+terminar)(?=\s|$)/i; return text.split(/[.!?;\n]+/).some((sentence) => duration.test(sentence) && task.test(sentence) && estimate.test(sentence)); }
function safeOperationFocusError(stage: string, error: unknown) { const row = error && typeof error === "object" ? error as Record<string, unknown> : {}; return { stage, name: typeof row.name === "string" ? row.name : error instanceof Error ? error.name : "Error", status: typeof row.status === "number" ? row.status : null, code: typeof row.code === "string" ? row.code : null, message: error instanceof Error ? error.message.slice(0, 300) : "Unknown operation focus error", requestId: typeof row.request_id === "string" ? row.request_id : typeof row.requestId === "string" ? row.requestId : null }; }
