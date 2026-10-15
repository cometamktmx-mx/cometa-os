import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const home = read("src/app/workspace/page.tsx");
const calendars = read("src/app/workspace/calendars/page.tsx");
const presentation = read("src/lib/workspace/presentation.ts");

assert.match(home, /getBrandActivity/);
assert.match(home, /event\.title/);
assert.match(home, /No hay actividad registrada hoy/);
assert.match(home, /changesRequested/);
assert.match(home, /internalReviews/);
assert.match(home, /scheduledPublications/);
assert.doesNotMatch(home, /QA COSMOS 01|Prevención dental/);

assert.match(calendars, /Contenido, revisiones y publicaciones de todas tus marcas/);
assert.match(calendars, /CalendarRow/);
assert.match(calendars, /PublicationRow/);
assert.match(calendars, /shortEditorialDate/);
assert.doesNotMatch(calendars, />[^<]*(draft|generated|internal_review|sent_to_client|changes_requested|approved_client)[^<]*</);
assert.doesNotMatch(calendars, /Estado Mercury|MERCURY \/|font-mono|brand\.slug}<\/p>/);
assert.match(calendars, /\/workspace\/brands\/\$\{brand\.slug\}\/calendar/);

for (const [raw, label] of Object.entries({ draft: "En preparación", generated: "Borrador interno", internal_review: "Revisión interna", sent_to_client: "En revisión del cliente", changes_requested: "Cambios solicitados", approved_client: "Aprobado por cliente", scheduled: "Programado", published: "Publicado", analyzed: "Analizado", cancelled: "Cancelado" })) {
  assert.match(presentation, new RegExp(`${raw}: "${label}"`));
}
assert.doesNotMatch(home + calendars, /fake|mock|fixture/i);
console.log("PASS: COMETA Admin Workspace Visual V2 contract");
