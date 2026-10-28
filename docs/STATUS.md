# Estado de implementación — 2026-10-08

## Brief en lenguaje natural y estados distintos al arte aprobado — 2026-10-08

`npm test` **167/167**, typecheck limpio. Sin Codex: todo verificado aquí.

- **`direction.set` / `direction.get`** (`packages/core/direction.ts`): el brief del humano como dato. `brief` literal, `musts` (requisitos con aserciones que los prueban) y `latitude` (lo creativo). `motion.verify` sin argumentos, los recibos de plan v2 (`verify.direction`) y el crítico (`MAI_DIRECTION_UNTESTED`) reportan cada requisito como passed, failed o untested. Prompt MCP `animate-from-brief`; skill `reference/brief.md`.
- **Estados que el arte aprobado no muestra:** `part.borrow` trae un dibujo de otro SVG del mismo design system (desde un archivo del proyecto, en tool, `ops.apply` o plan), oculto y con IDs prefijados, sin redibujar. Exige la misma mesa de trabajo, salvo con `align`. Rechaza `url(#…)`. Luego `sprite.define` y `sprite.keyframe` hacen el cambio.
- **Aserciones nuevas:**
  - `state`: qué variante de un sprite se ve en `at` o en `during`.
  - `matchesBaseline`: renderizada; la parte se ve como el aprobado en `at`. Con `relativeTo`, el padre y sus ancestros se mantienen en reposo (`frame({rest})`).
- **Crítica:** `MAI_SQUASH` ignora los fotogramas en que la parte está oculta.

## Prueba con una mascota de otro proyecto — 2026-10-08, Claude en vivo

Claude animó una mascota de otro proyecto en una sesión aislada (no incluida en este repositorio) usando solo las tools de MAI: plan v2, señales, `track.set` con tangentes, `motion.propagate`, envelopes, cámara, efectos, `motion.verify`, filmstrip, video y export. No se tocó la sesión del usuario.

- **Fallos reales de la herramienta encontrados y corregidos (con test):**
  - Guard de identidad: una señal de escala se trataba como escala 100 %, así que una respiración de 2 % en un ancestro nunca pasaba con rasgos `preserve`. Ahora usa la amplitud real (`signalPeak`). El error nombra el canal del envelope, si llega por un ancestro, la escala y el presupuesto, y sugiere `bounded`.
  - Aserciones: `relativeTo` (y en eventos de `before`) mide una parte dentro del marco de otra; antes era imposible probar "el brazo vuelve a reposo" mientras el torso respira.
  - `export` ignoraba `output`: ahora escribe la copia pedida dentro del proyecto, nunca sobrescribe ni sale del proyecto (`FILE_EXISTS`/`INVALID_ARGUMENT`).
  - `render.video` tenía fondo blanco fijo (un personaje blanco era invisible): `background` `auto` (gris si el arte es mayormente claro) o `#rrggbb`.
  - Crítica: `MAI_LOOP_POP` compara rotación módulo 360 (spinners); `MAI_SQUASH` ignora pop-ins uniformes desde escala 0; `MAI_SUBFRAME_KEYS` solo dentro de una misma pista (desfases entre canales son overlap intencional).
  - Benchmark: el verificador contaba solo pistas de keyframes; ahora cuenta señales, paths, cámara, efectos, beats, aserciones y contexto. Corrida `final` re-puntuada.
- **Lecciones en las skills** (`observe.md`, `motion.md`, `verify.md`, `identity.md`): blanco sobre blanco oculta el movimiento (comprobar el signo de rotación con zoom), detalles de reposo (pliegues) que se desvanecen al salir de reposo, primer plano demasiado cerrado, y timidez de amplitud.
- **Límite conocido:** `render.video` tiene presupuesto de 128 M píxeles; para 1024 px × 5 s se renderizan rangos `start/end` y se concatenan con ffmpeg (sin recodificar).


## Motion Director — continuación 2026-10-08 (Claude, tras la sesión de Codex)

`npm test` **155/155 pasan**; `npm run typecheck` pasa; golden intactos (sin regenerar).

- **Correcciones al trabajo de Codex (keyframes v2):** `track.edit reverse` convertía `linear` en `cubic-bezier` numérico, y eso rompía los golden. Ahora los easings con nombre se invierten de forma exacta (ease-in↔ease-out, overshoot↔anticipate). `clip.place` volvió a aceptar clips discretos invertidos (estados de sprite). Tests nuevos en `tests/curves.test.ts`: equivalencia legado↔handles, tangentes, hold, curva custom con rollback, auto con costura de loop, roving, reverse, stretch, inercia y round-trip.
- **Export con cortes:** un `step` dentro de una pista continua ya no lanza "discontinuity". Se exporta como transición instantánea, se cuenta en `report.jumps` y coincide con el motor en Chromium a ambos lados del corte.
- **Señales procedurales** (`packages/core/procedural.ts`; ops `signal.add/update/remove/bake`):
  - fuentes noise, wiggle, oscillator, pulse, blink, drift y curve, con envolvente (ventana, fades, decay, ramp, `multiplyBy` de param o de otra señal, clamp);
  - deterministas por semilla y sin costura en loops (valor y velocidad);
  - se mezclan como pistas en su capa (las aditivas suman; las override hacen crossfade por la envolvente) y alimentan params;
  - export SMIL: los eventos cortos (parpadeos) son puntos de corte del muestreo, y los atributos de filtro de dos componentes (`stdDeviation`) se interpolan por componente;
  - identidad clasificada por salida; limpieza al borrar targets; detector `MAI_ORPHAN_SIGNAL`;
  - tests en `tests/procedural.test.ts`, incluido SMIL vs motor en Chromium.
- **Beats y `acting.beat`** (`packages/core/timing.ts`):
  - beats como datos (`beat.set/delete`);
  - `acting.beat` compila reposo → anticipación opuesta → acción → overshoot → asentamiento largo (rebotes opcionales) en keys con tangentes, y registra los beats;
  - crítica informativa: `MAI_BEAT_HOLD_MOTION`, `MAI_BEAT_NO_ANTICIPATION`, `MAI_BEAT_OVERSHOOT_NO_SETTLE`, `MAI_BEAT_TOO_SHORT`;
  - `restPoints`; muestreo significativo con bordes de beats y picos de parpadeo.
- **Presets transparentes** (`packages/core/presets.ts`):
  - `expandPreset` devuelve las ops exactas; los clásicos producen las mismas keys de siempre (lo prueban los golden);
  - `breathe` con `style:"organic"`: asimétrico, con contra-escala y deriva;
  - `idle`: respiración, parpadeos con semilla compartida, mirada si hay `look-x/y`, orejas y cola desde su landmark `base`. Salta con nota las partes protegidas o que solo son región;
  - `operations.describe motion.preset` incluye el catálogo de lo que enseña cada preset;
  - inspección visual: los parpadeos y la cola se ven en el filmstrip con muestreo significativo.
- **Cámara 2.5D** (`packages/core/camera.ts`; ops `camera.set/depth/shot/fit`):
  - target reservado `@camera` (x, y = punto mirado, zoom, rotation) con pistas y señales;
  - planos de profundidad con parallax (`T(P)·S(z^(f−1))·T(−P_f)`, el roll se cancela);
  - `camera.shot` con 10 intents, paneo+zoom óptimo de van Wijk–Nuij y encuadres wide/medium/close-up con offset; handheld e impact como señales en `camera-shake`;
  - `frame()` envuelve la escena en `g#mai-camera`; el export SMIL descompone la cámara en grupos animables y coincide con el motor en Chromium (push-in, roll, parallax y corte);
  - `identity.check`, `compare.frames` y el gate perceptual de planes renderizan en espacio mundo, así que la cámara no cuenta como cambio del arte;
  - crítica: `MAI_CAMERA_SUBJECT_OUTSIDE`, `FAST`, `ZOOM_RATE`, `ROLL` y `PLANE_EDGE` (un plano full-bleed revela su borde: falta bleed);
  - `wide`/`establish` nunca alejan la cámara de una escena que llena la vista;
  - prueba visual con la escena hero del benchmark (establish → push-in con parallax).
- **Efectos** (`packages/core/effects.ts`; ops `effect.stack/remove`):
  - una macro transparente compila blur, glow (con pulso), shadow, saturate, hue, displace, motionSmear (blur direccional guiado por la velocidad real, con la fuente de señal `speed`) y echo (fantasmas `<use>` a poses retrasadas, sin IDs duplicados, también en SMIL);
  - nueva categoría de identidad `effects`: los overlays se permiten en partes protegidas (no en `locked`); recolor es `style` y displace es `geometry`;
  - arreglado de paso: `filter.set` rechazaba `merge.inputs` y `lighting light-x/y/z`.
- **Motion paths** (`packages/core/motion-path.ts`; ops `motion.path/remove/bake`): recorrido por longitud de arco a lo largo de `d` o por puntos con Catmull-Rom centrípeto, orientación a la tangente (pivote al ancla), modo absoluto o relativo, vueltas en paths cerrados, bake adaptativo y export SMIL igual al motor.
- **F3 · Motion Plan v2** (`mai.motion-plan/v2`, `packages/agent/plan-schema.ts`):
  - comando `ops` con cualquier operación (validada con su schema completo);
  - `assertions` evaluadas sobre el borrador y guardadas con la escena, gate opcional `verify`;
  - `evaluation` con filmstrip y crítica del borrador, y estado `loop` (`shouldContinue`);
  - v1 sigue aceptado sin cambios; `plan.execute` es la ruta principal (no destructiva) y MCP adjunta el filmstrip del borrador.
- **F3 · Contexto de uso** (`packages/core/context.ts`; op `context.set`; tools `context.get/set`): manifest con propósito, ubicación, viewport, loop, legibilidad facial, perfil, estilo y reduced-motion. Los priors por propósito (icono, hero, idle, sprite, logo…) aparecen en `scene.inspect`. La crítica informa desviaciones (`MAI_CONTEXT_DURATION/LOOP/CAMERA/PROFILE/REDUCED_MOTION`) sin bloquear.
- **F3 · Ramas** (`variation.branch/list/compare/promote/discard`): borradores evaluados guardados en `.cache/branches`, comparación lado a lado (una fila de filmstrip por rama más evidencia determinista), promoción con CAS y detección de ramas obsoletas. Son distintas de los choice boards humanos.
- **F4 · MCP v2:**
  - resources: `mai://scene/summary`, `context/current`, `timeline`, `operations`, `catalog/curves|signals|effects` y plantillas `operation/{type}`, `part/{ref}`, `preset/{name}`, `shot/{intent}`, `capability/{tool}`;
  - suscripciones que notifican cambios de revisión;
  - 6 prompts de flujo;
  - completions desde catálogos y desde la escena viva;
  - tests con el cliente oficial del SDK.
- **Carril A · Expresiones** (`packages/core/expr.ts`; fuente de señal `expr`):
  - Pratt parser seguro, sin `eval`: solo números, identificadores en lista blanca y límites (1000 caracteres, 256 nodos, profundidad 24, 8 funciones temporales, 32 referencias);
  - errores con código: `MAI_EXPR_SYNTAX`, `UNKNOWN_IDENTIFIER`, `UNKNOWN_FUNCTION`, `ARITY`, `TOO_COMPLEX`, `NONCONSTANT`, `BAD_REFERENCE`, `MISSING_TARGET` y `CYCLE` (con la ruta);
  - referencias a canales de otras partes (`body.rotation`, `ref('id','prop')`, huesos), `param.X` y `sig('id')`;
  - las referencias leen el movimiento previo a las expresiones (keys, paths, otras señales, rig, secondary), así que no hay auto-ciclos;
  - temporales `spring`, `smooth`, `delay`, `velocity`, `accel` y `valueAt`, simulados una vez por versión de escena (fingerprint) y sin costura en loops;
  - catálogo `mai://expr/functions`.
- **Carril A · `motion.propagate`:** cadena de overlap compilada en señales `expr` transparentes. Cada eslabón lee el canal final del anterior, así que el retraso se propaga y el látigo crece hacia la punta. Modos `drag` (respuesta de resorte a la velocidad, con límite suave `tanh`) y `follow` (copia tardía). Borrar una parte elimina en cascada los eslabones que la leían. SMIL coincide con el motor en Chromium.
- **Cámara `follow` real:** entra con van Wijk a un encuadre y luego sigue al sujeto con `smooth(ref(subject), lag)` según `motion`. Al terminar se queda donde el sujeto la llevó: la key final es el valor seguido, sin paneo de regreso.
- **F3 · Creative Envelope** (`packages/core/envelope.ts`; op `semantic.envelope`):
  - por canal (rigidTransform, deform, paint, topology, effects, visibility) se elige `free`, `bounded` o `preserve`, y eso sobrescribe lo que permiten los niveles; `preserve` niega incluso en partes libres;
  - lo `bounded` pasa el guard y luego se mide en el tiempo (≤240 muestras con puntos de reposo y bordes de beats): traslación y deformación relativas al tamaño de la parte, rotación, escala, pintura y opacidad;
  - una excursión transitoria se acepta solo si no supera `maxPeak`× el presupuesto, dura ≤ `maxDuration` y se recupera antes de cada punto de reposo (los loops envuelven la costura);
  - corre aunque la misma transacción afloje la política; si falla, hace rollback con `IDENTITY_BLOCKED` (`detail.kind` envelope/transient, canal, métrica, valor medido, presupuesto, tramo y razón);
  - `scene.identity` muestra los ratios pico/presupuesto. Ejemplo: un ojo protegido que parpadea sin perder su forma en reposo;
  - pendiente: `transientBoost` de landmarks dentro de beats de acción.
- **F5 · Reduced motion:** `export {profile:"standalone", reducedMotion:"still"|"fade", at?}` genera un archivo aparte, porque SMIL no lee `prefers-reduced-motion` y duplicar el arte duplicaría IDs.
  - `still`: un fotograma congelado (0 en loops, el final en one-shots).
  - `fade`: la escena congelada que conserva solo las transiciones de opacidad y color, sin transformaciones, cámara, paths, señales de movimiento, secundario, warps ni ecos.
  - El reporte trae el snippet `<picture>`. Verificado en Chromium.
- **F5 · Compat e IR:** features `camera`, `camera-parallax`, `motion-path`, `signals`, `expressions`, `effects-stack`, `echo` y `keyframe-handles`, con opciones por target (Lottie: handles y paths nativos, señales y expresiones horneadas; SVG estático: congelar). `buildIR` resume señales, paths, cámara, beats, efectos y envelopes.
- **F4 · Estudios** (`study.save/list/get`, `mai://study/{id}`):
  - guarda en `studies/<id>/` contexto, brief, receta (escena actual o rama), aserciones, última crítica y filmstrip;
  - sin la cita de aprobación del humano queda en `pending-review` y nunca se presenta como aprobado.
- **F4 · Skills migradas:**
  - las 9 skills escritas a mano viven en `skills-src/` y se generan para Claude Code y Codex (`agents/openai.yaml` incluido); el test de drift las cubre;
  - se actualizaron mai-animate (controles del motor, presets como punto de partida), mai-refine-animation (ciclo filmstrip → verify → cambio único → compare; envelope) y mai-preserve-identity (envelope);
  - referencias nuevas `relations.md` (expresiones y cadenas) y secciones de envelope (identity) y reduced motion (verify).
- **Editor, cambio mínimo:** guía de encuadre de cámara con action-safe y title-safe (rotada con el roll), más el toggle "Vista de cámara", que reencuadra el lienzo al viewBox de la cámara sin parallax y recorta al artboard. Verificado en el sandbox; la edición de puntos en vista de cámara no se probó.
- **Skills:** `motion.md` reescrito como ciclo completo de dirección (con plan v2, contexto, ramas, efectos y paths); nueva referencia `camera.md`; referencias nuevas `curves.md` (vocabulario de tangentes y recetas de señales) y `observe.md` (cómo mirar y juzgar).
- **Baseline:** re-puntuada con `--rescore`. Válidas: alien-idle (Claude: 48 llamadas, 61 keyframes, 5 presets, idle correcto pero casi imperceptible), bell (Claude) y Candy (cortada por cuota). Todas las de Codex y 5 de Claude fallaron por cuota; repetir cuando se liberen.


## Motion Director F1 — continuación 2026-10-07 (parcial)

Se retomó `packages/core/space.ts` de la sesión interrumpida. El motor no se refactorizó y los golden no se regeneraron.

- `space.ts`: transformaciones acumuladas de padres + poses + base; bounds de curvas con extremos cúbicos, geometría animada, exclusión de defs sin depender de DOM de navegador. Targets vacíos o no soportados fallan explícitamente; caché de evaluación acotada.
- `render.motion` / `render_motion` / `mai motion render`: PNG/SVG de trayectoria del centro, espaciado y velocidad; muestras numéricas. MCP adjunta las imágenes.
- `motion.verify` / `verify_motion` / `mai motion verify`: seis predicados muestreados (`moves`, `still`, `energy`, `arc`, `returnsToRest`, `loopSeamless`). `not_evaluated` cuenta como fallo. Energía = RMS de velocidad del centro; arco = cambio total de rumbo; reposo y costura comparan bounds, no pintura/identidad. No confundir con aprobación visual.
- `render.video` / `render_video` / `mai video`: MP4/WebM mediante ffmpeg local, fuente export con fallback engine reportado, póster, máximo 600 frames/1024 px/128 millones de píxeles; limpia temporales y archivos parciales ante fallo. Preview sobre blanco, sin audio, alpha ni motion blur.
- Las tres tools son experimentales, de lectura/render y utilizables offline con `--file`. No alteran documento, revisión o protecciones.
- Evidencia reproducible: `node --import tsx scripts/motion-f1-proof.ts`; `experiments/evidence/motion-f1/report.json`, `bell-baseline.mp4`, `bell-poster.png`. Usa la campana guardada del benchmark anterior: no es una nueva ejecución de Claude/Codex. Filmstrip inspeccionado: oscilación amortiguada y badge visible; el trail muestra el arco del centro.

Verificación de esta continuación: `npm test` **91/91 pasan, 0 omitidas**; `npm run typecheck` y `npm run build` pasan. Incluye los 8 golden intactos, 8 pruebas espaciales/de contrato y 2 de video (MP4/WebM decodificados con frames distintos). Después de acotar la caché espacial se repitieron las 16 pruebas core/golden y typecheck. Logs: `experiments/evidence/motion-f1-tests.log` y `motion-f1-core-tests.log`.

**F1 sigue abierta:** faltan predicados before/lags/overshoots/settles/insideFrame/visible, persistencia de assertions, gráficas por canal y siluetas, regiones semánticas móviles, muestreo por beats/keys, compare.motion, performance.probe, critique v2/record y retención de artifacts. Video aún sin GIF/WebP, crop por parte, motion blur o fallback de encoder. Geometría no mide stroke, clipping, filtros ni visibilidad; use/text/imagen y SVG anidado no se evalúan. Las métricas no prueban identidad ni calidad artística.

La copia `experiments/evidence/motion-bench-2026-10-08-baseline.json` encontrada sigue sin re-puntuación guardada (changed=false incluso en casos con llamadas). Baseline completa con ambos agentes sigue pendiente; no tratar los fallos de cuota como evidencia de calidad. El plan completo recuperado está en `docs/MOTION-DIRECTOR-PLAN.md` (diseño objetivo, no estado implementado).


## Motion Director F0 — 2026-10-07 (plan `~/.claude/plans/lazy-gliding-church.md`)

Objetivo: que el agente tenga los mandos de un animador y vea el movimiento, con la identidad protegida por invariantes. F0 = línea base y desbloqueos baratos. `npm run typecheck` pasa; `npm test` **81 pruebas, 81 pasan** (63 previas + 18 nuevas).

| Pieza | Estado | Evidencia |
|---|---|---|
| Golden del motor (frames, proyecto, exports editable/standalone) | **Hecho** | `tests/golden.test.ts`, `tests/golden-scenes.ts`, `tests/fixtures/golden-*.json`; regenerar solo ante un cambio intencional: `npx tsx scripts/golden.ts --update` |
| Tests que faltaban: easing, springs, critique | **Hecho** | `tests/golden.test.ts` |
| Schemas completos de las 106 operaciones | **Hecho** | `packages/core/operation-schemas.ts`; tools `operations.list` / `operations.describe` (sin sesión); `ops.apply`, ops de tableros y `mai apply` del CLI validan contra el schema completo y rechazan campos desconocidos con la lista aceptada. 552 ops reales de la suite validan sin falsos rechazos. `tests/operations-schema.test.ts` |
| Ojos mínimos: `render.filmstrip` | **Hecho (experimental)** | Hoja de contactos rotulada, onion skin, encuadre por parte, una sola carga de página (`openRenderSession`); dry-runs aceptan `preview.filmstrip`; MCP adjunta la hoja (JPEG si excede 1.5 MB). `tests/observe.test.ts` |
| Skills sin techo de presets | **Hecho** | `skills-src/mai-svg/reference/motion.md` reescrito (primitivas, beats, overlap, arcos, loops, mirar y refinar); `mai-animate` y el editor exponen todos los easings |
| Benchmark de movimiento | **Arnés hecho; baseline pendiente** | 8 casos en `benchmarks/motion/cases`; `scripts/motion-bench.ts` (workspace aislado, sesión de cualquier commit con `--ref`, adaptadores Claude Code y Codex, verificación con las métricas actuales, galería). Corridas sin agente pasan en los 8 casos. La baseline real (`--ref 4476799 --agent claude,codex --all --label baseline`) no se pudo correr: cuota semanal de Claude CLI agotada hasta el 10-oct 4 pm y cuota de Codex agotada hasta las 7:40 pm del 7-oct |

Hallazgos de F0:
- Bug corregido: el export standalone fallaba con cualquier color (`fill`/`stroke`) interpolado, porque el redondeo a hex (±0,5) superaba la tolerancia de 0,25. Regresión en `tests/golden.test.ts`.
- La lista MCP de tools pesa ~114 KB por cliente y el schema completo de ops ~93 KB, por eso este último se sirve bajo demanda (`operations.describe`) y no en la definición de `apply_operations`.
- `ops.apply` sigue marcada *destructive*, y los clientes MCP piden confirmación en cada llamada. El plan v2 (F3) será la ruta principal de autoría sin esa fricción.
- El editor sigue usando `/api/apply` sin validación de schema (solo el CLI se valida); pendiente cuando haya cobertura de flujos del navegador.


## Superficie de agentes S0–S4 — estado verificado 2026-10-04

Base integrada en `a7a0a6e`; correcciones de preservación del 2026-10-05 en el checkout local. MAI no interpreta lenguaje humano: Claude/Codex leen la instrucción y llaman herramientas tipadas (un registro → CLI, HTTP `/api/agent/call`, MCP con SDK oficial 1.32.0). `feedback.ts` queda como fallback sin ampliar. Las métricas no son aprobación estética; **las 44 áreas del pedido original no están completas** (ver «Qué falta»).

Checkout verificado el 2026-10-05: `npm run typecheck` y `npm run build` pasan; `npm test` **60 pruebas, 60 pasan, 0 omitidas**, incluyendo Firefox y WebKit (`experiments/evidence/smoke-emitter-suite-20261005.log`).

Correcciones de la revisión: el gate de identidad bloquea el plan si cualquier parte requerida queda sin evaluar, incluso si otras pasan; `identity.preserve` acumula las protecciones sobre el borrador y las conserva al asociar la referencia. Regresiones: cobertura mixta con y sin región/renderizador, cero commit ante cobertura incompleta, bloqueo persistente después de guardar/reabrir y rechazo de una pose posterior.

| Gate | Estado | Evidencia |
|---|---|---|
| S0 guards, referencias, contrato de preview, entorno | **Pasa** | F01/F03/F04/F05/F08 como regresiones en `tests/agent-surface.test.ts`; preview conserva 180 px lógicos y declara `scale`; Firefox/WebKit de Playwright y `.venv-segmentation/` instalados (DEPENDENCIES.md): los 4 fallos de entorno anteriores ahora se ejecutan y pasan |
| S1 Agent IR y transacción atómica | **Pasa** | `tests/agent-plan.test.ts`: un plan = un commit; fallo del último comando, del disco, del render requerido o de identidad deja cero cambios; requestId idempotente y recuperado tras reinicio; CAS de revisión/tablero; undo restaura escena y decisión |
| S2 integración visible | **Pasa** (tiempos de una sola muestra) | `tests/editor-flow.test.ts` en Chrome real: selección → comentario con captura → nota → mezcla → commit → WebSocket → repintado sin recarga → undo. `s2-editor-flow.json`: 94 ms servicio, 100 ms visible, una muestra en fixture pequeño |
| S3 paridad CLI/API/MCP | **Pasa** | `tests/transports.test.ts`: mismo resultado normalizado y mismo error por los tres transportes; cliente SDK independiente lista y llama; ciclo de vida, JSON inválido, cancelación y EOF |
| S4 Candy + agente externo | **Parcial** | Ver abajo. Falta la respuesta humana pendiente, aprobación artística y tiempos con muestras |

Comprobación adicional del 2026-10-05 en copia aislada de Candy: dry-run, commit del humo ×0.8 con boca bloqueada y nariz preservada, y undo completo. Identidad pasa en 0/1/3 s sin partes omitidas; nariz MAE 0. El tablero permanece pendiente. Evidencia: `experiments/evidence/preservation-candy-20261005.json` y `.png`. Es una regresión técnica por script, no una nueva corrida de agente externo ni aprobación artística.

Prueba visible adicional del 2026-10-05: un subagente independiente, sin historial ni acceso al código/pruebas, recibió una dirección nueva de ensayo para reducir el humo 40% conservando ojos/boca/nariz y dejando las expresiones pendientes. Inspeccionó el vocabulario público y la escena, preparó dry-run, revisó cuatro previews y confirmó una transacción (rev 17 → 18). Postcommit: 16 evaluaciones de identidad, MAE 0, sin omisiones; factor humo 0.6 y tablero pending. El editor visible se actualizó por WebSocket sin recargar. Dry-run 26.35 s, commit 29.65 s, identidad posterior 13.12 s; muestras únicas, rendimiento pendiente. Dos tropiezos recuperados: red local bloqueada por sandbox y `execute --help` no soportado. Evidencia: `experiments/evidence/live-candy-trial-20261005.json` y `live-candy-editor-20261005.jpg`. Es una prueba con subagente y herramientas públicas; no sustituye la corrida pendiente de un cliente externo independiente ni decide la aprobación artística.

Ajuste visual solicitado el 2026-10-05: el usuario rechazó el humo anterior por parecer una ola. El preset geométrico smoke elimina la onda lateral coherente, atenúa el movimiento de la punta junto al recorte para evitar un corte plano, y agrega subida local (`lift`) y expansión (`spread`) con ruido a varias escalas y emisor anclado. Controles del inspector para velocidad/subida/remolinos/ondulación; aplicado en la sesión aislada (rev 35), identidad de ojos/boca/nariz pasa contra snapshot previo. Evidencia: `smoke-refinement-20261005.json`, `smoke-cleanup-editor-20261005.jpg`. No es física ni aprobación estética automática. Limpieza por color: selección/región o dibujo, tolerancia de blanco plano, candidatos resaltados, exclusión de defs/máscaras/partes y regiones protegidas, retiro de IDs revisados y undo. La búsqueda en Candy dio 1246 candidatas y excluyó 129 protegidas, sin borrarlas. Prueba de navegador cubre ámbito, exclusiones, resaltado sin guardarlo, eliminación selectiva y undo; prueba de humo cubre anclaje, ascenso predominante y cierre de loop a velocidad fraccional.

### S4 en detalle

Workspace aislado por corrida (`scripts/s4-workspace.ts`): copia del Candy aprobado con hash, sesión propia, skill generada y MCP; sin código fuente ni plan solución. Candy se prepara solo con herramientas de agente. Agente externo: **Codex** (`codex exec`, MCP stdio). Claude Code no pudo usarse como agente externo porque su OAuth estaba expirado. Verificación independiente: `scripts/s4-verify.ts`.

| Corrida | Instrucción | Resultado |
|---|---|---|
| 1 | «Me gusta la primera pero con los ojos de la tercera. Conserva la boca y baja 30% la velocidad del humo.» | 9 llamadas, 0 errores. Un plan confirmado (A + ojos de C, boca preservada, humo ×0.7), identidad contra el aprobado pasa (nariz MAE .081, boca .084). `s4-candy-codex-run1.json` |
| 2 | Petición no prevista: «Pensándolo mejor, quiero la segunda opción tal como estaba, pero el humo debería sentirse más pesado, como si costara subir. A la nariz no le toques nada.» | 48 llamadas, 11 errores de MAI y 4 rechazadas por el cliente. Encontró cinco huecos reales del producto (abajo). Confirmó el humo ×0.55 (factor .385) con la nariz preservada. **No aplicó B**: su boca cambia píxeles del borde de la nariz. Usó rodeos (aplicar y revertir la expresión fuera del plan, un tablero suelto). `s4-candy-codex-run2.json` |
| 3 | La misma instrucción de la corrida 2, desde el mismo estado (plan de la corrida 1 reproducido por script y marcado como tal) y con las correcciones | 9 llamadas, 0 rechazos. Usó `rechoose` sobre el tablero original. El gate por píxeles de región bloqueó B en la nariz (MAE 2.50 > 1.5) y Codex **no aplicó nada**: pidió al humano el contorno exacto de la nariz. Estado intacto y coherente (rev 16). `s4-candy-codex-run3.json` |

Huecos encontrados por la corrida 2 y corregidos con regresión (`S4 regression` en `tests/agent-plan.test.ts`, assert en `transports.test.ts`):
1. Cambiar de opción en un tablero ya elegido: `variant.apply` con `rechoose:true`. La nueva aceptación reemplaza a la anterior en la misma transacción (`supersedes`), y undo vuelve a la anterior. Sin ese flag, `STALE_CHOICE` trae `recovery.action:"rechoose"`.
2. Partes preservadas que solo son una región del arte compartido (la nariz de Candy, `ids: []`): el gate de identidad de los planes las evalúa por píxeles en su región (`method:"region-pixels"`, mismo umbral que `identity.check`), en vez de devolver `not_evaluated`.
3. La frescura del tablero (`contentHash`) ignoraba solo revisión y decisiones; ahora también etiquetas, protecciones y baselines, que no cambian un fotograma.
4. `history.undo/redo` estaban marcadas `destructiveHint`, y Codex las rechazaba sin preguntar. Son reversibles entre sí y ya no se marcan; `ops.apply`, `choice.dismiss/regenerate` e `identity.release` siguen marcadas.
5. `part.candidates` con scope de una parte que solo es región (`candy.head`): busca dentro del ancestro con un único elemento (hallado en la corrida 3, corregido después).

Conflicto que queda para decisión humana: la nariz en sí (el triángulo rosa) no cambia con B, pero la boca abierta de B toca el borde inferior de la caja de la nariz (MAE 2.50 en la caja, 8.08 en la de la boca): `experiments/evidence/s4-frames/nose-conflict-current-vs-B.png`. Opciones: delimitar la nariz con sus propios trazos (`part.candidates` → confirmar), aceptar ese borde, o pedir otra boca. MAI no elige.

Fidelidad y entrega (corridas 2 y 3): fotograma completo en reposo frente al aprobado con MAE .0116/255 y SSIM .9999; alfa parcial conservada (8,529 píxeles parciales en ambos); 11 píxeles en el borde de extracción del humo difieren más de 2/255 en alfa (máx. 48). Es una limitación conocida. El humo es el original extraído (MAE en reposo .087) y fluye en los siete tiempos. Export editable de 10.4 MB que reabre con parámetros, modificadores y aceptaciones iguales. Standalone de 24.4 MB, 0 raster y 0 scripts. Las fuentes aprobadas no cambiaron (sha256).

### Qué falta (no se marca como hecho)
- S4: respuesta humana al conflicto nariz/boca; aprobación artística de las expresiones de Candy (las métricas no lo son); una petición nueva distinta después de las correcciones, porque la corrida 3 mide las correcciones y no la generalización; tiempos con muestras/percentiles en Candy (solo hay muestras únicas); prueba con Claude Code como agente externo.
- Herramientas `experimental` (funcionan, sin calibrar en todos los assets): fluid.animate, motion.spring, morph.apply, part.candidates, expression.rig, critique, performance, export.capabilities, expression.propose.
- Exportación: CSS animations y Lottie/dotLottie están `planned`; el componente React es `partial`. Rig anatómico automático, detección automática de partes, física de fluidos y Safari nativo: no implementados.
- Los otros 31 gatos siguen pendientes de revisión individual.

Las secciones siguientes conservan resultados históricos de etapas anteriores; sus conteos de pruebas no describen el estado actual.

## Decisión de calidad

El usuario eligió **high-color-preserved**: «que sea el high-color-preserved ese es». Se conserva el candidato original elegido; es ahora el predeterminado del conversor, importación y batch. Registro: `QUALITY-SELECTION.json`.

## Implementado

| Área | Resultado verificable |
|---|---|
| Conversión | 32 personajes y 32 composiciones SVG válidas, cero raster; PNG/WebP/JPG y SVG con imágenes incrustadas; batch y comparación |
| Preservación | Hashes de los 32 originales/fixtures coinciden; auditoría estructural de las 32 composiciones conserva nodos, atributos y CSS originales |
| Geometría | Selección, región, zoom/pan/aislamiento, pluma/dibujo/formas, anclas y handles, creación/subdivisión/borrado de puntos, curvas, dividir/unir/cerrar/simplificar/booleanas |
| Capas y estilo | Agrupar, ordenar, bloqueo, nombres, colores, grosor, opacidad, gradientes lineales/radiales, pivotes y poses |
| Animación | Keyframes, interpolación, easing, scrubbing, loop, reproducción, onion skin de trazos; transformaciones, opacidad, color y `d` |
| Rig | Reposo global, jerarquía FK, límites, IK de dos segmentos, pesos normalizados, corrección por punto, malla y keyframes de controles |
| Guardado | SVG editable con metadatos v1; distribución SMIL sin scripts/raster; deformación horneada adaptativamente, presupuestos explícitos; archivos locales en exports/ |
| Agentes | CLI comparte operaciones, revisiones esperadas, transacciones atómicas, historial/undo/redo, journal/recovery y WebSocket; cinco skills validadas |

## Evidencia actual

- `npm run typecheck` y `npm run build`: pasan.
- `npm test`: **20 pruebas, 20 pasan**; ver `experiments/evidence/editor-tests.tap`.
- `assets-audit.json`: **32/32 válidos**, cero raster; 27,345–73,312 paths, hasta 11,840,605 bytes.
- `browser-compatibility.json`: transformaciones SMIL comparadas con el motor en Chromium, Firefox y WebKit, tres tiempos por motor.
- `embedding-compatibility.json`: SVG como documento y `<img>` en esos motores. Para `<img>`, animación no repetida de 1 ms congelada en la pose final; no controla tiempos arbitrarios dentro de la imagen. La prueba inline usa pauseAnimations/setCurrentTime.
- Las capturas transparentes se verifican con Chromium; Firefox/WebKit se compararon con fondo opaco por una limitación del renderer de Firefox en macOS.
- `session-benchmark.json`: tiempo de transacción del servicio y arranque+CLI/WebSocket medidos por separado; undo, redo, conflictos, autenticación y recuperación al reiniciar comprobados.
- `ui-benchmark.json`: **24 ms** desde emisión de WebSocket hasta dos requestAnimationFrame en el editor abierto, sobre una edición simple de Candy. Excluye arranque del CLI y trabajo del servicio; es una muestra, no percentiles de rendimiento.
- Verificación visual en el editor: gato complejo visible, selección de cola del demo, punto arrastrado/deshecho, creación de keyframes y cambio del CLI visible sin recargar.
- `candy-floating-editable.svg`, `candy-floating-standalone.svg` y `candy-frame-2.5.png`: personaje real con movimiento global, 49,661 paths, 7.91 MiB, cero raster. No es un rig anatómico reconstruido. `examples/rig-demo-editable.svg` sí contiene dos huesos, skin y malla animados sobre el gato de práctica; su distribución y fotogramas también se guardaron.
- `skills-validation.txt`: las cinco skills pasan el validador.
- `npm-audit.json`: **0 vulnerabilidades** tras actualizar Sharp y SVGO; licencias y versiones en DEPENDENCIES.md y licenses/.

## Límites y trabajo de calidad pendiente

Esta es una implementación funcional de las capacidades principales, con verificación local. No se presenta como una suite profesional terminada ni como validación estética automática de toda la colección.

1. Los otros 31 gatos requieren revisión visual individual. Todos tienen mucha fragmentación y están etiquetados `requires-cleanup`, incluso si conservan bien su apariencia. No hay reducción automática a pocas formas anatómicas.
2. Las zonas ocultas y partes para rig se preparan manualmente. Una máscara de alfa fija no puede deformarse automáticamente con el trazo: el binding bajo esa máscara se rechaza. Preparar parte permite movimiento rígido preservando alfa; para deformación hay que reconstruir opacidad/gradientes o quitar la máscara explícitamente y revisar los bordes.
3. No se promete 60 FPS con 70,000 caminos. La carga/operaciones estructurales pueden tardar segundos. La muestra de propagación rápida no demuestra ese rendimiento para todas las escenas o rigs.
4. WebKit no equivale a una prueba de **Safari nativo**: esta sigue pendiente. Tampoco se probó cada gato en cada navegador y contexto.
5. El muestreo adaptativo verifica cuartos/medios/tres cuartos de intervalos: su error reportado no es una cota matemática continua. Mezclar saltos y curvas en una pista puede exceder presupuesto y rechazarse; ajustar las pistas en vez de rasterizar.
6. Abrir el perfil de distribución conserva la animación nativa, pero no reconstruye pistas/rig de autoría; usa el editable para roundtrip completo.
7. El navegador integrado no confirmó el evento de descarga de un blob durante la primera prueba. La interfaz ahora guarda siempre el archivo en MAI SVG/exports y ofrece descarga HTTP; el archivo creado desde el botón se confirmó en disco y el guardado/descarga del servicio se verifican en la prueba de sesión.
8. Electron/distribución instalable quedan como entrega posterior opcional; no hubo publicación ni despliegue.

Reproducir y evaluar con README.md, EDITOR.md y CLI.md. No borrar .cache/ durante una sesión activa; contiene el autosave y el historial.

## Extensión de agentes y composición — 2026-10-04
Contexto PRODUCT/VECTOR/MOTION y skill mai-svg inspirados en Impeccable. CLI capabilities/quality/audit, transacciones dry-run, composición con namespaces, canvas, cuatro recetas de keyframes y edición/copia de pistas. Proof/compare generan evidencia visual en tiempos definidos.
Limitación de composición: CSS/keyframes se aíslan mediante parser; reglas globales no soportadas requieren estilos inline; animación y rig importados se compilan a SMIL, no se fusionan sus metadatos con el timeline/rig de la escena. Las geometrías y poses del componente sí se editan.

Verificación de esta extensión: 24 pruebas funcionales pasan, 0 fallos; typecheck/build pasan, seis skills válidas. Render/proof/compare verificados con Chrome oficial instalado. Las dos pruebas de compatibilidad completas fallan por ausencia de ejecutables Firefox/WebKit en este entorno; no se presentan como aprobadas. Evidencia: experiments/evidence/agent-delivery.json.

## Personajes, emociones y sprites — 2026-10-04

Bibliotecas reutilizables de emociones y estados de sprites, operaciones atómicas en CLI/editor, morph facial de topología estable y keyframes discretos. Exportación de atlas SVG con manifiesto y PNG opcional, y preview GIF local; los maestros siguen siendo SVG.

Demostración: `examples/emotions/milo-editable.svg`, construido con 129 operaciones reproducibles. Seis emociones, parpadeo, 26 pistas, dos huesos para cola articulada, saludo, anticipación, salto y squash/stretch. Atlas de 24 fotogramas y SVG autónomo sin raster ni scripts. Milo es dibujo vectorial preparado para demostrar actuación; no demuestra extracción automática de anatomía de Candy ni calidad profesional automática.

Verificación: 29 pruebas funcionales pasan, incluyendo CLI, roundtrip de bibliotecas, rollback, exclusividad de sprites y comparación de fotogramas del SVG exportado en Chrome. Typecheck/build pasan. Firefox/WebKit siguen pendientes por ausencia de ejecutables. Checkpoint de Candy: `experiments/evidence/candy-before-emotions-autosave.svg`. Ver `docs/CHARACTERS.md` y `experiments/evidence/character-tests.tap`.

## Candy real: actuación desde la conversión aprobada

Se añade examples/candy-emotions con master SVG editable y autónomo, seis emociones, parpadeo y sprites del Candy high-color-preserved original. Preparación localizada manual de regiones, sin reemplazar la ilustración por otro gato ni rasterizar el master. 72 operaciones del CLI aplicadas en vivo (revisión 21), 21 pistas. Conservar limitaciones de reconstrucción facial y anatomía oculta; no se declara calidad profesional terminada. Evidencia visual en experiments/candy-approved-character y prueba de fidelidad en experiments/evidence/candy-character-tests.tap.


## Conservación de facciones y entrega al videojuego — 2026-10-04

Catálogo de 32 entradas: GAME-ASSETS.md, GAME-ASSETS.json y GAME-ASSETS.csv. PNG → SVG conserva el nombre base; personajes en assets/vector y composiciones en assets/animated. Las aprobaciones visuales individuales pendientes aparecen en el catálogo.

Se añadieron segment (OpenCV GrabCut con rectángulos guía, PNG/WebP/JPG), separate (máscaras vectoriales y fuente compartida), identity-check (MAE RGBA por regiones y tiempos), gate opcional de identidad durante vectorize y identity.protect/release en motor/inspector. No hay inferencia anatómica automática ni reconstrucción de partes ocultas.

Candy corregido: se eliminaron las bocas sustituidas y el aplastamiento de iris. Boca y nariz permanecen en la cabeza original; los ojos originales mantienen su geometría. Las expresiones usan actuación rígida, párpados temporales y efectos. 83 operaciones, 13 pistas, 4 regiones protegidas. Se regeneraron editable/standalone, seis sprites SVG, atlas PNG opcional y GIF de 54 fotogramas. Cargado en el editor local, revisión 22.

Prueba de regresión: la variante antigua es rechazada; la corregida pasa siete tiempos (0, .66, 1.6, 2.8, 4.1, 5.2, 6.5). MAE nariz .2989 y boca .0702 sobre 255 después de alinear movimiento rígido. Es comparación de regiones, no reconocimiento semántico ni aprobación artística. Evidencias: experiments/identity-regression y experiments/evidence/candy-identity-regression.json.

Validación: typecheck y build pasan; npm test ejecutó 36 pruebas: 34 pasan, 2 fallan por ejecutables de Firefox/WebKit ausentes. La compatibilidad completa permanece pendiente. Diez skills pasan quick_validate; se añadieron mai-preserve-identity, mai-separate-parts, mai-game-delivery y mai-refine-animation. El validador YAML se instaló solo en /private/tmp, no como dependencia del producto.

Límites actuales: Candy tiene aproximadamente 49.674 paths y 8,3 MB; falta optimización medida para videojuegos. Las máscaras conservan la imagen en reposo y soportan poses rígidas; rig deformable/anatomía necesitan preparación. Las nuevas skills autorizan mejorar instrucciones y animación local manteniendo referencia y regresiones.


## Fluidos vectoriales y decisiones con previews — 2026-10-04

Fluid.add / mai fluid admite smoke, water, wind y lava en calidad draft/balanced/high. Genera curvas periódicas de topología estable y loop exacto, con gradientes de transparencia para humo. Son efectos artísticos, no física, colisiones, viscosidad o CFD. La conversión de la región estática requiere identificar/recortar el efecto; no se reconoce automáticamente un fluido desde una imagen.

Candy aprobado mantiene sus paths originales y las facciones. Un recorte vectorial oculta solamente el humo estático; el nuevo emisor está ligado a candy-flask. Se añadieron cejas/párpados expresivos y una lágrima opcional, sin sustituir el hocico por una línea. 84 operaciones, 25 pistas. Aplicado mediante CLI load + apply: revisión 24, transacción de 3294.88 ms en este gato complejo. WebSocket actualizó el editor; esta medida no cumple un presupuesto de 250 ms para Candy.

Choices propose/show/choose/dismiss admite 2–4 alternativas, recomendación razonada, previews PNG enfocables, persistencia y revisión esperada. Proponer no modifica la escena. Elegir es una transacción reversible; una edición posterior invalida las alternativas (409). El selector del editor muestra dos opciones reales de tristeza a 5.2 s y espera elección del usuario. Emotion.update reemplaza una definición sin reescribir claves anteriores; las alternativas incluyen las nuevas claves explícitamente.

Pruebas actuales: npm test 41 pruebas, 39 pasan y 2 fallan por falta de los ejecutables de Firefox/WebKit. Typecheck y build pasan. Skills mai-svg/mai-refine-animation actualizadas y validadas. Fluidos: topología, loop, playback/exportación SMIL y rechazo atómico. Decisiones: previews sin edición, recorte de facciones, persistencia, WebSocket, elegir, undo, duplicados, conflictos y token. CLI fluid genera un SVG editable real. Regresión de nariz/boca: rechaza el caso antiguo y aprueba siete tiempos con los efectos actuales.

Entregables: examples/candy-emotions/{candy-editable.svg,candy-standalone.svg,candy-preview.gif,sad-choice.json,options/,sprites/}; guía docs/FLUIDS-AND-CHOICES.md y evidencia experiments/evidence/{fluids-full-suite.tap,candy-fluid-identity.json,candy-fluid-live-apply.json,candy-sad-choice-live.json,candy-fluid-choice-editor.png}. Son previews y candidatos locales; queda revisión artística y optimización de los SVG grandes.

## Emisión de humo — 2026-10-05

El usuario rechazó tanto la deformación inicial como la variante ascendente porque parecían una ola. Se añadió un emisor independiente: bocanadas vectoriales suaves, nacimiento escalonado, subida, expansión, remolinos y disipación con reciclado transparente. Controles en el inspector y `smoke.emit` compartido por API, CLI y MCP. El tiempo de vida se ajusta a ciclos enteros del loop; el mismo id permite modificar el emisor en una transacción con deshacer. Los gradientes propios se retiran al reemplazarlo, conservando referencias compartidas. No es CFD ni reconocimiento automático del contenido del SVG.

Candy aislado en http://127.0.0.1:4498/ pasó de revisión 35 a 36. Emisor en (504,233), 32 bocanadas, subida 4.5 s, altura 190, expansión 1 y turbulencia .8. La capa de humo original queda oculta y su modificador desactivado, conservando geometría y alfa; no se han eliminado blancos. Ojos, boca y nariz pasan identidad contra el snapshot anterior en 0, 2.25, 4.5, 6.75 y 9 s. Candidato visible, pendiente de revisión artística del usuario. Aplicar este cambio en Candy tardó 39.287 s: sigue siendo lento en SVG grande. Evidencia: experiments/evidence/smoke-emitter-candy-20261005.json.

Regresiones verifican ascenso, expansión, desaparición, cierre de loop, reapertura editable, equivalencia raster editor/SMIL autónomo, rechazo de controles fuera de presupuesto, previsualización sin mutación, actualización sin acumulación de gradientes, preservación de gradientes compartidos y deshacer del emisor junto con la fuente. Se reutilizan comprobaciones de referencias solo entre claves generadas consecutivas; la identidad continúa verificándose y los cambios estructurales invalidan esa caché.
