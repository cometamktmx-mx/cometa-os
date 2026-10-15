# PULSAR Commercial Intelligence V1

PULSAR interpreta snapshots agregados de Reports V1A y señales deterministas V1C. PostgreSQL conserva hechos; el modelo propone explicaciones y pruebas sin afirmar causalidad.

## Contrato

- Prompt: `pulsar_v1`; schema: `pulsar_report_v1`.
- Modelo por defecto: `gpt-4.1-mini`, configurable con `PULSAR_OPENAI_MODEL`.
- Input: negocio, periodo, summary, top 10 productos/clientes, resumen y top 10 riesgos de inventario, loyalty, calidad y top 20 señales.
- Output estricto: summary, health status sin score V1, hasta cinco findings/opportunities/risks/hypotheses/actions y tres notas de calidad.
- Structured Outputs usa JSON Schema estricto; el backend vuelve a validar límites, enums y referencias a signal IDs.

## Guardrails

Los datos POS se delimitan como datos no confiables frente a prompt injection. No se envían teléfonos, emails, direcciones, tickets crudos ni catálogos completos. Hipótesis se etiquetan y describen qué las confirmaría. Acciones incluyen medición y nunca se ejecutan. No hay web search, herramientas externas, chain-of-thought, campañas ni scheduler.

## Persistencia e idempotencia

`pos_intelligence_reports` es inmutable desde browser. Un SHA-256 de JSON canónico, junto con scope, periodo, prompt y modelo, evita llamadas y reportes duplicados. El snapshot exacto permite auditar qué vio PULSAR. Historial y detalle se leen con RPCs tenant-scoped.

## Calidad y limitaciones

PULSAR debe bajar confianza con baja identificación o cobertura. Marcas sin historial usan `insufficient_data`. Days of stock es ritmo observado; recompra no es intención; pares no son causalidad. No se implementa cron, ROI, predicción, atribución ni V1E actions.
