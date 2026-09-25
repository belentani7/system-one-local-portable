# System One Local — Worklog

## Estado actual del proyecto

**System One Local** es una réplica en Next.js 16 del contrato `/v1/systemone` de TypeSafe AI (Jev): un modelo de **decisión tipada** que recibe un `state` + un esquema de preguntas (`choice` / `noul` / `score`) y devuelve decisiones estructuradas con `value + confidence`. Cero generación de texto libre → cero alucinación.

El proyecto está **funcional y verificado end-to-end** con agent-browser. La API responde, el motor LLM devuelve decisiones calibradas, el historial persiste en SQLite (Prisma) y la UI renderiza en claro/oscuro y móvil.

## Objetivos / modificaciones completadas

### Arquitectura
- **`src/lib/systemone/schema.ts`** — Esquemas Zod v4 para `Choice`, `Noul`, `Score`, `Question`, `Answer`, `DecideRequest`, `DecideResponse` (contrato TypeSafe-compatible). Helpers `isChoice/isScore/isNoul` y `PRIMITIVE_META` con metadatos visuales.
- **`src/lib/systemone/confidence.ts`** — Calibración: `softmax` con temperatura estabilizada, `calibrate` (penaliza decisiones ambiguas por margen top-1/top-2), `argmax`, `weightedScore` (posición ponderada para `Score`), `shouldEscalate` (umbrales + zona gris 0.3–0.7 para `Noul`), `estimateTokens`.
- **`src/lib/systemone/engine.ts`** — Motor "parallel sampler": en una sola pasada LLM scorea TODAS las opciones de TODAS las preguntas sobre el mismo prefill. El LLM actúa como *scorer* (no genera prosa, solo JSON de scores crudos), y el engine normaliza con softmax + sigmoid y calibra el confidence. Singletón de `z-ai-web-dev-sdk`.
- **`src/lib/systemone/presets.ts`** — 4 presets listos: triaje de tickets, moderación, enrutado de agente, clasificación de facturas.
- **`src/lib/systemone/index.ts`** — Barrel PÚBLICO (no reexporta `engine.ts` para no arrastrar `z-ai-web-dev-sdk` server-only al bundle cliente).

### Base de datos
- `prisma/schema.prisma` — modelo `DecisionLog` (state, questionsJson, answersJson, latency, tokens, escalación, threshold, timestamps) con índices en `createdAt` y `requiresEscalation`. `bun run db:push` ejecutado.

### API (contrato `/v1/systemone`)
- **`POST /api/decide`** — Recibe `{state, model, questions, confidence_threshold, temperature}`, valida con Zod, ejecuta el motor, persiste en `DecisionLog` y devuelve `{model, answers, usage:{input_tokens,output_tokens:0}, latency_ms, requires_escalation, escalated_questions}`.
- **`GET /api/presets`** — Lista los 4 presets.
- **`GET /api/history?limit=N`** / **`DELETE /api/history`** — Histórico y borrado.

### UI (playground en `/`)
- **`src/app/page.tsx`** — Playground completo: editor de `state` (textarea + token estimate), editor visual de preguntas (añadir/editar/eliminar choice/noul/score con sus opciones), settings (slider de umbral + temperatura), botón Run, panel de resultado con métricas (modelo, latencia, tokens, escalación), grid de tarjetas de decisión, visor JSON colapsable del contrato request/response, e historial reciente clickable. Hero con badges y mini-stats agregadas (avg latency, escalation rate, contador).
- **`src/components/systemone/`** — `confidence-meter.tsx` (barra con marcador de threshold), `probability-bars.tsx` (barras horizontales con ganador resaltado), `escalation-badge.tsx`, `primitive-icon.tsx` (chips CHOICE/Noul/Score con colores), `decision-card.tsx` (tarjeta por pregunta con sub-views para cada primitiva), `question-editor.tsx`, `result-metrics.tsx`, `preset-card.tsx`, `json-viewer.tsx`.
- **`src/components/theme-provider.tsx`** + **`theme-toggle.tsx`** — Soporte claro/oscuro con `next-themes`.
- **Layout** — Sticky header (top), `main flex-1`, footer `mt-auto` (sticky al fondo). Metadata actualizada a "System One Local — typed decisions, not prose".

## Verificación (agent-browser + VLM)
- **API curl directo**: `POST /api/decide` con ticket de soporte → `department=account` (confidence 1.0), `is_angry=1.0`, `frustration=2` (Furious, confidence 0.999). Latencia 1551ms. ✅
- **UI flujo completo**: clic en "Run decision" → renderiza 3 tarjetas (Choice/Noul/Score) con badges, barras de probabilidad, medidores de confianza con marcador de umbral, badge de escalación. VLM confirmó "clean and professional layout", "decision cards clearly visible", "confidence meters and probability bars well-formatted". ✅
- **Tema oscuro**: toggle funciona, VLM confirmó "dark theme correctly applied", "no contrast issues", "accent colors pop effectively". ✅
- **Mobile 390px**: single column, sin overflow, header bien dimensionado, footer al fondo sin overlap. VLM: "fully mobile-optimized". ✅
- **Historial**: persiste decisiones en SQLite, recarga tras cada run, clickable para revisar decisiones pasadas. ✅
- **Sticky footer**: verificado en mobile y desktop. ✅
- **Lint**: `bun run lint` limpio. ✅

## Limitaciones / notas
- **Latencia variable (1.5s – 23s)**: Jev real promete 70–500ms porque usa un modelo System One entrenado con RLCD + parallel sampler nativo. Nosotros usamos el LLM hosted del SDK como *adapter*: el LLM scorea opciones y nosotros normalizamos. Es una réplica del **contrato**, no de la **arquitectura interna**. Para latencia real habría que desplegar un modelo local (Kev-4B / Mapika/decider / Laya) — fuera del sandbox Next.js.
- **Confidence calibrado por aproximación**: sin RLCD real, usamos softmax + penalización por margen top-1/top-2. Funciona razonablemente (decisión clara → 0.99–1.0, decisión ambigua → baja). Para calibración estadística real haría falta un set de validación con isotonic regression.
- **Zod v4**: `z.record(...).min(1)` no existe → cambiado a `.refine(rec => Object.keys(rec).length >= 1)`.
- **Bundle cliente**: el barrel `index.ts` no reexporta `engine.ts` (que importa `z-ai-web-dev-sdk` server-only con `fs/promises`) para no romper la compilación del Client Component `page.tsx`. La API route importa `decide` directamente desde `./engine`.

## Próximos pasos sugeridos
1. **Calibración con isotonic regression** sobre un set de validación etiquetado (ej: 100 tickets ya triaged por humanos) para que confidence=0.8 ≈ 80% de acierto real.
2. **Streaming del JSON**: ahora esperamos al JSON completo; se podría tokenizar el stream para mostrar scores parcialmente (mejora UX percibida).
3. **Comparativa A/B**: dejar correr el mismo state por dos motores (local vs. Jev real vía API) y comparar latency + agreement.
4. **WebSocket live updates** del historial (mini-service en puerto 3003 vía gateway Caddy) para que nuevas decisiones aparezcan sin refresh.
5. **Export CSV / JSON** del historial para análisis offline.
6. **Más presets**: clasificación de emails (sales/support/spam), detección de PII, routing multilingüe.
