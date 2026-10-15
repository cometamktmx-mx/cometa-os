import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const file = "src/app/page.tsx";
const source = fs.readFileSync(path.join(root, file), "utf8");

const ids = new Set([...source.matchAll(/id="([^"]+)"/g)].map((match) => match[1]));
const anchors = [...source.matchAll(/href="(#([^"]+))"/g)].map((match) => match[2]);
const missingAnchors = anchors.filter((anchor) => !ids.has(anchor));

const checks = [
  ["landing route exists", fs.existsSync(path.join(root, file))],
  ["Cometa OS is primary brand", /Cometa OS, inicio/.test(source) && /sistema operativo/.test(source)],
  ["POS is self-service entry product", /Cometa POS[\s\S]*Self-service/.test(source)],
  ["signup CTA is canonical", (source.match(/\/signup\?product=pos/g) || []).length >= 1],
  ["login CTA is canonical", /const LOGIN = "\/login"/.test(source)],
  ["15-day trial is stated", /15 días gratis/.test(source)],
  ["no-card claim matches signup", /Sin tarjeta/.test(source) && /no requieren tarjeta|No necesitas tarjeta/.test(source)],
  ["self-service and managed are distinct", /Self-service[\s\S]*Advanced · Con Cometa/.test(source)],
  ["retail is available", /Tienda \/ Retail", "Disponible", true/.test(source)],
  ["fashion is available", /Moda \/ Ropa", "Disponible", true/.test(source)],
  ["restaurant is upcoming", /Restaurante \/ Caf\\u00e9", "Pr\\u00f3ximamente", false/.test(source)],
  ["services are upcoming", /Servicios \/ Belleza", "Pr\\u00f3ximamente", false/.test(source)],
  ["no hospitality active claim", !/Hospitality[\s\S]{0,80}Activo/i.test(source)],
  ["no restaurant active claim", !/Restaurant[\s\S]{0,80}Activo/i.test(source)],
  ["demo metrics are labeled", /Vista demo/.test(source) && /Señal demostrativa/.test(source)],
  ["commercial CTA uses real contact", /mailto:cometa\.mktmx@gmail\.com/.test(source)],
  ["no empty href", !/href="#"/.test(source)],
  ["all section anchors resolve", missingAnchors.length === 0],
  ["no invented customer proof", !/testimonio|empresas conf.an|clientes satisfechos|n.mero uno|primero de LATAM/i.test(source)],
  ["metadata describes POS and OS", /export const metadata[\s\S]*Punto de venta e inteligencia[\s\S]*Cometa POS conecta ventas/.test(source)],
  ["mobile navigation exists", /<details[\s\S]*Abrir navegaci/.test(source)],
  ["focus-visible support", /focus-visible:ring/.test(source)],
  ["reduced-motion friendly motion", /motion-safe:hover/.test(source)],
  ["no heavy media dependencies", !/<video|<canvas|three|WebGL|framer-motion/.test(source)],
  ["official Cometa logo asset is used", fs.existsSync(path.join(root, "public/logo.png")) && /src="\/logo\.png"/.test(source)],
  ["invented CSS mark was removed", !/function CometaMark/.test(source)],
  ["premium layered product stage exists", /data-product-stage/.test(source) && /perspective:1600px/.test(source)],
  ["POS uses asymmetric bento showcase", /data-pos-bento/.test(source) && /RegisterMiniature/.test(source)],
  ["data flywheel is continuous", /data-data-flywheel/.test(source) && /from-transparent via-blue-400/.test(source)],
  ["Intelligence uses a demo board", /data-intelligence-board/.test(source) && (source.match(/demostrativa/gi) || []).length >= 2],
  ["Cometa OS uses an ecosystem map", /data-ecosystem-map/.test(source) && /Un sistema\.[\s\S]*Todas las piezas\.[\s\S]*hacerte crecer/.test(source)],
  ["Cometa MKT relationship is explicit", /Un sistema creado por Cometa MKT/.test(source)],
  ["WhatsApp and Meta claim is qualified", /WhatsApp \/ Meta/.test(source) && /disponibles según configuración/.test(source)],
  ["icon system covers core modules", ["terminal", "wallet", "inventory", "tag", "heart", "chart", "spark", "chat"].every((name) => source.includes(`name === "${name}"`))],
  ["purposeful responsive layouts exist", /sm:grid-cols-2/.test(source) && /lg:grid-cols-4/.test(source) && /sm:rotate-0/.test(source)],
  ["COMETA mother brand uses real asset", /alt="Cometa"/.test(source) && /Un sistema creado por Cometa MKT/.test(source)],
  ["POS and OS two-layer story exists", /data-two-layers/.test(source) && /Opera hoy\. Crece mañana/.test(source)],
  ["POS pricing is exact", /\$399/.test(source) && /\$499/.test(source) && /\$899/.test(source)],
  ["POS plan names are exact", /name: "Start"/.test(source) && /name: "Pro"/.test(source) && /name: "Multi"/.test(source)],
  ["all POS plans use canonical signup", /data-pos-pricing/.test(source) && /href=\{POS_SIGNUP\}/.test(source)],
  ["POS to OS transition exists", /data-pos-os-bridge/.test(source) && /El POS es sólo el comienzo/.test(source)],
  ["Brand IA has a product surface", /data-brand-ai/.test(source) && /ORION → NOVA → ATLAS/.test(source)],
  ["Sales AI has a qualified demo", /data-sales-ai/.test(source) && /Chat comercial/.test(source) && /disponibles según configuración/.test(source)],
  ["Agency-Tech dual layer exists", /data-agency-tech/.test(source) && /Tech \+ Strategy/.test(source) && /Growth Partner/.test(source)],
  ["OS pricing is separate and exact", /data-os-pricing/.test(source) && /Desde \$9,000/.test(source)],
  ["OS commercial CTA remains functional", /href=\{COMETA_CONTACT\}/.test(source) && /Solicitar auditoría/.test(source)],
  ["plans anchor exists", /id="planes"/.test(source)],
  ["expanded icon system exists", ["message", "growth", "automation", "brand", "target", "database", "layers"].every((name) => source.includes(`name === "${name}"`))],
  ["no backend plan persistence invented", !/planCode|selectedPlan|checkoutSession|stripe/i.test(source)],
  ["V4 hero uses 40/60 split", /lg:grid-cols-\[0\.4fr_0\.6fr\]/.test(source)],
  ["hero daily summary is complete", /Resumen del día/.test(source) && /\$128,430/.test(source) && /Transacciones/.test(source) && /\$364/.test(source)],
  ["hero operational panels exist", /Caja 1/.test(source) && /Top productos|Camisa Linen Azul/.test(source) && /sin stock/i.test(source)],
  ["four hero floating panels exist", (source.match(/<FloatingPanel/g) || []).length === 4 && /Inteligencia · ORION/.test(source) && /Growth · PULSAR/.test(source)],
  ["POS data intelligence growth strip exists", /Operación diaria/.test(source) && /Datos en tiempo real/.test(source) && /Decisiones inteligentes/.test(source) && /Crecimiento sostenible/.test(source)],
  ["Sales AI three-panel demo exists", /Pipeline · Demo/.test(source) && /Insights · Demo/.test(source) && /Probabilidad de cierre/.test(source)],
  ["dark visual system dominates", (source.match(/bg-\[#050b16\]|bg-\[#07111f\]/g) || []).length >= 10],
  ["no visible HTML entities remain", !/&[a-zA-Z]+;/.test(source)],
  ["Cometa MKT Growth Partner section exists", /Cometa MKT · Growth Partner/.test(source) && /Un equipo que sabe qué hacer con ella/.test(source)],
  ["Tech and human strategy are connected", /data-agency-tech/.test(source) && /Tech \+ Strategy/.test(source) && /Growth Partner/.test(source)],
  ["POS OS MKT value flow exists", /data-cometa-value-flow/.test(source) && /Cometa POS/.test(source) && /Cometa OS/.test(source) && /Cometa MKT/.test(source)],
  ["Meta and WhatsApp language is prudent", /Meta Ads · WhatsApp/.test(source) && /Canales e integraciones según estrategia y configuración/.test(source)],
  ["Cometa OS commercial price is preserved", /Desde \$9,000/.test(source) && /No es una licencia SaaS aislada/.test(source)],
  ["Automation accent is UTF-8", /Automatización/.test(source) && !/Automatizaci&oacute;n/.test(source)],
  ["Accompaniment accent is UTF-8", /Acompañamiento/.test(source) && !/Acompa&ntilde;amiento/.test(source)],
];

const failed = checks.filter(([, passed]) => !passed);
for (const [name, passed] of checks) console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
console.log(JSON.stringify({
  checks_total: checks.length,
  checks_passed: checks.length - failed.length,
  failed_count: failed.length,
  missing_anchors: missingAnchors,
  all_checks_passed: failed.length === 0,
}));
if (failed.length) process.exitCode = 1;
