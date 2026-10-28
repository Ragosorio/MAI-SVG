# Plan: MAI Motion Director: que la IA anime SVG como video sin perder el original

## Contexto

**Qué pides.** Que MAI SVG sea la mejor herramienta *agent-first* de animación SVG:
- que la IA tenga libertad creativa y produzca movimiento fluido y vivo, con sensación de video, cámara, arcos, overlap y pausas;
- que entienda dónde y para qué se usará el SVG;
- que haga pruebas y se corrija;
- que siempre conserve el arte original.

Hoy el resultado es "mágico" solo a veces.

**Continuidad.** La sesión anterior (2026-10-07) hizo lo siguiente antes de quedarse sin cuota:
- leyó el informe `deep-research-report (1).md`;
- clonó VectorCraft, EffectCraft, svg-character-animator y tracing-video-to-animated-svg (MIT/Apache; tomamos conceptos, no código);
- exploró el repo con 3 agentes;
- dejó dos briefs de diseño.

Esta sesión partió de ahí:
- recuperó esos reportes;
- re-verificó el código;
- agregó investigación: MoVer, LogoMotion, Keyframer y las skills de Remotion;
- completó el diseño del motor (Anexo A) y de la superficie de agente.

**Decisiones del usuario (2026-10-07):**
- personajes vivos y cámara **en paralelo**;
- benchmark con **Claude Code y Codex**;
- salida **SVG/SMIL + previews de video**. Lottie y un runtime JS quedan como fase futura, aunque los keyframes v2 ya se diseñan convertibles a Lottie.

**Diagnóstico verificado.** El problema no es la falta de presets. El poder del motor está escondido tras un catálogo de acciones.

1. **El agente no puede expresar lo que el motor sabe.**
   - El Agent IR v1 tiene 3 comandos: `packages/agent/plan.ts` y `schemas/agent-plan.v1.schema.json`.
   - `ops.apply` expone 106 ops pero su schema solo valida `type` (`packages/agent/registry.ts:23`).
   - No hay `operations.describe`.
   - `packages/core/agent.ts:3` lista 46 ops viejas.
   - `apply_operations` está marcado *destructive*, así que los clientes MCP piden permiso en cada llamada. Eso frena el ciclo de experimentar.
2. **Las skills empujan a presets.**
   - `skills-src/mai-svg/reference/motion.md` dice "spring/damping/delay from the preset, no manual keyframes".
   - `mai-animate` y el editor (`apps/editor/src/App.tsx:14`) limitan el easing a linear, ease-in-out y step.
3. **Faltan los mandos del animador.**
   - Un keyframe es solo `{time,value,easing}`, sin tangentes.
   - No hay motion paths: `animateMotion` se rechaza.
   - La capa `camera` es solo un nombre.
   - Los springs no se encadenan.
   - `Secondary.layer`, `TimeRegion` y `StateMachine` no se evalúan.
   - No hay ruido determinista.
4. **El agente no ve movimiento.**
   - `preview.render` devuelve ≤8 PNG sueltos y MCP adjunta ≤4.
   - No hay filmstrip, video, trails ni gráficas.
   - `compare.frames` dice escribir PNGs y no lo hace.
5. **La crítica es superficial.**
   - Solo mira poses.
   - No mide continuidad de velocidad, arcos ni overlap.
   - No tiene tests.
6. **Faltan piezas de contexto y de MCP.**
   - No hay contexto de uso, benchmark de calidad/autonomía ni ramas de exploración.
   - El MCP expone solo tools, sin resources, prompts ni completions (`packages/mcp/server.ts`).

**Resultado buscado.** MAI pasa de "IA que llama herramientas SVG" a un entorno donde la IA **dirige, anima, filma, observa, verifica, critica y refina**, con el original protegido por invariantes por canal.

## Principios (se codifican en código, skills y tests)

- **Restringir identidad, no creatividad.** Los permisos van por canal y por parte. Se permiten desviaciones transitorias si se recuperan en reposo.
- **MAI nunca interpreta lenguaje natural.** El agente traduce palabras a primitivas, aserciones y contexto. MAI ejecuta y mide.
- **Los presets enseñan, no esconden.** Toda macro se expande a primitivas inspeccionables y editables.
- **Ver en movimiento.** Nada se describe como logrado sin mirar el filmstrip y el trail. Los LLM ven imágenes: la hoja de contactos es su vista y el video es para el humano.
- **El humano decide la intención y el agente explora la ejecución.** Las ramas internas sirven para experimentar. Los choice boards se usan solo si la intención es ambigua.
- **Las métricas no son aprobación estética.** Las tools nuevas nacen `experimental` hasta pasar el benchmark.
- **Se conserva el caparazón de seguridad:** SVG como fuente de verdad, CAS, journal, undo tokens, baselines, dry-run, identity guard, IDs y referencias intactos. Nunca se incrusta un raster.

## Arquitectura objetivo

```
HUMANO (intención · contexto · elecciones)
 └ AGENTE (interpreta · dirige · escribe aserciones)
    └ Motion Plan v2 (ops del motor con schema + compiladores v1)  ── dry-run / ramas
       └ Creative Envelope (permisos por canal + invariantes + desviación transitoria)
          └ MAI Engine: grafo de canales → frameState único (tracks, paths, señales, expresiones, cadenas, cámara, efectos)
             └ OBSERVAR (filmstrip·trail·graph·video) + VERIFICAR (aserciones) + CRITICAR (determinista + veredicto visual)
                └ refinar (el agente) ↺   │   commit atómico (CAS + journal + undo)
```

Todo nuevo se evalúa en `frameState`, así que editor, previews, crítica y export SMIL lo heredan. Hay dos reglas de espacio:
- **Pantalla (con cámara).** La usan lo que ve el público: filmstrip, video y `insideFrame`.
- **Mundo (sin cámara).** La usan los gates de identidad, `identity.check`, la comparación perceptual y el envelope. Un push-in no debe "cambiar" la identidad. Se usa `FrameOptions.camera:false` y, para recortar por parte con cámara, se mapean los bounds con la matriz de cámara.

## Fases

Cada fase termina corriendo el benchmark de F0 contra la línea base. Después de F2 se abren **dos carriles en paralelo** (A personajes, B cámara/composición), que convergen en F3. El contrato entre carriles queda en `docs/adr/003-motion-engine-v2.md` y se toma del Anexo A: orden de `frameState`, tipos, ops y categorías.

### F0: Línea base y desbloqueos baratos (M)

1. **Benchmark de movimiento** (antes que todo, para medir).
   - Cada caso vive en `benchmarks/motion/<caso>/` con `original.svg`, `context.json`, `brief.md`, `invariants.json`, `assertions.json` (opcional), `human-quality-notes.json` (manual) y `reference.mp4` (opcional).
   - Casos iniciales:
     - idle del mini-character (`scripts/fixtures/mini-character.ts`);
     - acting de Milo (`examples/emotions`);
     - Candy con humo y expresión (`examples/candy-*`);
     - 2 gatos del juego en idle (`docs/GAME-ASSETS.json`);
     - reveal de logo sintético;
     - icono UI;
     - escena hero con cámara.
   - `scripts/motion-bench.ts` (patrón de `scripts/s4-workspace.ts`):
     - arma un workspace aislado con sesión, skills y la config MCP de cada agente;
     - el agente recibe **solo el brief**;
     - adaptadores `--agent claude` (`claude -p --output-format stream-json` con MCP `mai-svg`) y `--agent codex` (`codex exec --json` con `mai-svg` en su config MCP);
     - guarda el transcript.
   - `scripts/motion-bench-verify.ts` (patrón de `s4-verify.ts`) puntúa 5 ejes separados:
     - fidelidad: `identity.check` contra los invariantes;
     - craft técnico: audit, critique y performance;
     - calidad de movimiento: scores deterministas y aserciones;
     - dirección: notas humanas;
     - **autonomía**: llamadas, errores, primitivas vs presets, iteraciones, si miró el filmstrip antes del commit, prompts humanos.
   - Salida en `experiments/evidence/motion-bench-<fecha>.json`, más una galería HTML de filmstrips.
   - Se corre la **baseline** con el MAI actual en ambos agentes.
2. **Tests de caracterización (golden)** antes de cualquier refactor del motor (Anexo A, fase 0):
   - `tests/golden.test.ts` y `tests/fixtures/golden-*.json` cubren `frameState`, `simulateSecondary`, keys de `motion.preset` y el export standalone;
   - se agregan los tests que faltan de critique, springs y easing;
   - `packages/core/agent.ts` deriva `operationTypes` de `OPERATION_TYPES`.
3. **Schemas completos de las 106 ops.**
   - Van en `packages/core/schemas/operations.v1.schema.json`: `oneOf` discriminado por `type`, `$defs` por op con `description`, `examples[]` y `x-mai:{family, identityCategories, macro, fixture?}`.
   - `ops.apply` valida con `$ref`; hay que extender el tipo `Schema` de `registry.ts` con `$ref` y `$defs`.
   - Un campo desconocido devuelve un error con la lista de campos aceptados (patrón de EffectCraft).
   - Tools nuevas `operations.list {family?}` y `operations.describe {type}`, que devuelven schema, ejemplos, identidad y, si es macro, su expansión.
   - `tests/operations-schema.test.ts` comprueba tres cosas:
     - cada tipo tiene su def;
     - cada ejemplo valida y se aplica sobre el fixture mini;
     - los `examples/*.json` existentes siguen validando.
   - El sombreado `mai apply`/`mai export` (`packages/cli/main.ts:87`) se arregla o se documenta.
4. **Quitar el techo de las skills ya mismo.**
   - `motion.md`: los presets pasan a ser punto de partida y los keyframes manuales son legítimos.
   - `mai-animate` y el dropdown del editor muestran todos los easings existentes.
5. **`render.filmstrip`.** Es el "ojo" mínimo y se adelanta a esta fase por impacto y bajo coste; el detalle está en F1.

**Salida:** evidencia baseline, golden y schemas en verde, y filmstrip llegando por MCP como imagen.

### F1: Ver, verificar y criticar (M)

`packages/server/observe.ts`, con `RenderSession`:
- Una página Playwright carga el SVG **una vez** y busca cada instante con `setCurrentTime`. El `renderSvg` actual hace un `setContent` por frame, inviable para video de gatos de 8 MB.
- Tiene dos fuentes:
  - `export`: el standalone, rápido y fiel a lo entregado. Es la fuente por defecto si `exportCapabilities` lo marca fiel.
  - `engine`: `m.frame(t)`.
- El resultado reporta qué fuente usó.

Tools nuevas en `registry.ts` y `service.ts`:

| Registry / MCP | Qué hace |
|---|---|
| `render.filmstrip` / `render_filmstrip` | **Un PNG hoja de contactos** con N celdas rotuladas con tiempo, marker y beat. Acepta `count` 4–36 (default 12) o `times`, `part\|region`, `columns`, `scale`, `ghost` (onion skin) y `camera` (on/off). El muestreo inteligente usa `significantTimes()` del motor: bordes de beats, keys, cortes y extremos de velocidad. |
| `render.video` / `render_video` | MP4/WebM/GIF/WebP con `fps` 6–30, `start/end`, `width` ≤1024, `part` y `motionBlur:{shutterAngle,samples}` (sub-frames, idea de Remotion). Encoder: ffmpeg del sistema; si no hay, el ffmpeg de Playwright (solo webm); si no, sharp GIF/WebP. Reporta el encoder, tiene un cap de 600 frames y devuelve `posterPath` igual al filmstrip. |
| `render.motion` / `render_motion` | Acepta `views:['trail','spacing','graph']`. **trail:** pivote, centro y siluetas fantasma para ver arcos. **spacing:** el gráfico de espaciado clásico. **graph:** valor y velocidad por propiedad (`channelSeries`, `velocityAt`) con keys, beats y costura. Se dibujan como SVG y se rasterizan con el mismo renderer. |
| `compare.motion` / `compare_motion` | Compara contra previous, snapshot, baseline o rama. Genera una hoja [A \| B \| mezcla 50 %] por tiempo, como `render_compare.py` (los bordes desplazados aparecen como fantasmas). Incluye MAE, SSIM e IoU por frame y por parte, y deltas de energía y trayectoria. |
| `performance.probe` / `probe_performance` | Intervalos rAF mediana/p90/p99 y frames perdidos del standalone, como `<img>` e inline, en Chromium. Es medido, no estimado (idea de `perf_probe.py`). |
| `motion.verify` / `verify_motion` | **Aserciones de movimiento**, los tests de la animación (detalle abajo). |
| `critique.record` / `record_critique` | Veredicto visual estructurado del agente. Se guarda como `decision.log` kind `critique` con evidencia por id de artifact. **Nunca es un gate.** |

**Aserciones**, en `packages/core/verify.ts`. Están inspiradas en MoVer (Stanford 2025), donde corregir con un reporte de predicados fallidos subió el acierto de 58.8 % a 93.6 %.
- El agente traduce el brief a predicados JSON. MAI los evalúa sobre una `EvalSession` con `partBounds()` del motor.
- Predicados v1:
  - `moves {part, direction, during|beat, minDistance}`
  - `still {part, during, maxSpeed}`
  - `before {a:{part,event}, b, gap}`
  - `lags {follower, driver, delay:[min,max]}` (por correlación cruzada)
  - `arc {part, during, minCurvature}`
  - `overshoots` / `settles`
  - `returnsToRest {part, at}`
  - `insideFrame {part, safeArea}` (espacio pantalla)
  - `visible`
  - `loopSeamless`
  - `energy {part|scene, min|max, during}`
- Resultado: `{passed, failed:[{assertion, measured, expected, times, hint, trailPath?}]}`.
- Las aserciones se persisten en `project.assertions` y sirven de regresión entre refinamientos.

**Critique v2** (determinista, `packages/core/critique.ts`). Checks nuevos:
- continuidad de velocidad en el loop, medida con wrap;
- rectitud de trayectorias (falta de arcos);
- lag y correlación entre driver y follower;
- *twinning*: arranque y parada simultáneos, o espejo exacto;
- espaciado uniforme, que se lee robótico;
- pops en `d`, modificadores y params.

Los `repair` sugieren primitivas, no presets. Los hallazgos de cámara, beats y envelope se agregan cuando existan sus módulos.

**Ajustes a lo existente:**
- `images()` en `packages/mcp/server.ts` reconoce `sheet.path`, `posterPath` y `views[].path`, prioriza hojas, detecta mimeType y comprime a JPEG/WebP para quedar ≤1.5 MB.
- `mutation().preview` acepta `filmstrip:{count}`.
- `compare.frames` escribe sus PNG, o se corrige su descripción.
- Los artifacts van a `.cache/observe/<rev>/` con retención (200 archivos o 500 MB).

### F2: Fundación del motor (L)

Corresponde a las fases 1–2 del Anexo A y la necesitan ambos carriles:
- `curves.ts` y `mix.ts`;
- keyframes v2 con tangentes in/out `{speed,influence}`, auto/continuous, roving, CustomEase e inercia;
- ops `track.set`, `key.tangent`, `curve.custom` y `curve.inertia`;
- `track.edit`, `copy`, `clip` y `retime` conscientes de los handles;
- `jumps` en el export para holds mezclados;
- `graph.ts` + `EvalSession`, con `frameState` refactorizado sobre un grafo de canales (debe pasar los golden);
- `procedural.ts` con señales `signal.*`;
- `Secondary.layer` operativo;
- categorías de identidad `view` y `effects`.

**Rendimiento.** El editor llama `frameState` por frame (`App.tsx:32,48`). Hace falta cachear la `EvalSession` por objeto `project` (WeakMap) y un test que limite el tiempo por frame con Candy.

### Carril A (paralelo): Personajes vivos (L)

Corresponde a las fases 3, 4, 5 y 8 del Anexo A:
- **DSL de expresiones seguro** (`expr.ts`, Pratt parser, sin `eval`), con referencias a otros canales, delay, spring, velocity y noise.
- **Cadenas de overlap** con `motion.propagate`.
- **`motion.path`** con orientación a la tangente y longitud de arco.
- **Beats de actuación**, `acting.beat`, `time.remap`, `time.freeze` y `time.reverse`.
- **Presets transparentes** con `expandPreset`, un `breathe` que enseña y `idle`: respiración, parpadeo con semilla, mirada, orejas y cola en cadena.

### Carril B (paralelo): Cámara y composición (L)

Corresponde a las fases 6–7 del Anexo A:
- **Cámara 2.5D** con target reservado `@camera`, pistas x, y, zoom y rotation, planos de profundidad con parallax, y wrappers generados en `frame()` y en el export.
- **`camera.shot`** con 10 intents y paneo+zoom de van Wijk–Nuij; además `camera.fit` y `cameraReport`.
- **`effect.stack`**: glow, smear guiado por velocidad, echo/trail con `<use>`, vignette, etc.
- **Editor, cambio mínimo:** guía del encuadre de cámara y safe area, más un toggle de vista de cámara.

Follow y handheld dependen del DSL del carril A (`smooth()`). Hasta que llegue, B entrega shots por keys y deja follow/handheld para el final del carril.

### F3: Motion Plan v2, Creative Envelope, contexto y ramas (L)

**Motion Plan v2** (`mai.motion-plan/v2`, `packages/agent/schemas/motion-plan.v2.schema.json`):
- **Sin duplicar el motor.** Los comandos v2 son las **ops del core validadas con el schema de F0**: track.set, motion.path, signal.add, motion.propagate, acting.beat, camera.shot, effect.stack, time.*, motion.preset, etc.
- **Compiladores.** `plan.ts` pasa a un registro `COMPILERS` en `packages/agent/compilers/` con la firma `(cmd, ctx:{base, draft, part, host, plan}) => {ops, changes, warnings}`.
  - Los 3 comandos v1 se mueven ahí sin cambios: v1 sigue aceptado y sus tests no se tocan.
  - El compilador genérico `op` resuelve direcciones semánticas (`address.ts`) a ids y produce `changes`.
  - `preset.apply` devuelve las piezas y notas de `expandPreset`.
- **Campos del plan:** `context` (inline o `{ref:'current'}`), `constraints.envelope[]`, `assertions[]`, `commands` (≤64), `evaluation {times, filmstrip, video, critique, verify, identity, performance}` y `required`.
  - `required` siempre incluye structural; identity, perceptual y verify son opcionales.
- **Presupuesto.** Si se superan las 500 ops, el error es `BUDGET_EXCEEDED` con las ops de cada comando. Un plan nunca se parte en varias transacciones.
- **`refinement`.** No auto-anima: devuelve `loop:{pass, stop:{identity, technicalFindings, verify, visualConfidence}, shouldContinue}`, calculado de forma determinista. El siguiente cambio lo decide el agente.
- **Ruta principal de autoría.** `plan.execute` acepta ambos protocolos según `protocol`. Es la ruta principal porque no está marcado destructive. `ops.apply` queda como escape directo.

**Creative Envelope** (core, fase 9 del Anexo A):
- `semantic.envelope` asigna a cada canal (rigidTransform, deform, paint, topology, effects, visibility) un valor `free|bounded|preserve`, más invariantes y `transientDeviation`.
- `verifyEnvelope` es consciente del tiempo: un squash o smear puede pasarse del presupuesto si se recupera en los puntos de reposo.
- El plan traduce `constraints.envelope` a esta op y a los preserves existentes.

**ContextManifest** (`packages/agent/schemas/context.v1.schema.json`):
- Campos:
  - `purpose`: ui-icon, loading, logo, hero, editorial, explainer, character-idle, character-acting, game-sprite, social-video, sticker, ambient o custom;
  - `placement`, `viewport`, `interaction`, `loop`;
  - `priority.faceReadability`;
  - `performance.profile`, de `packages/core/profiles.ts`;
  - `motionStyle {energy, playfulness, cinematic}`;
  - `accessibility.reducedMotionVariant`.
- Se guarda en `project.context` mediante la op `context.set`, que queda en el journal y es reversible.
- Tools `context.set` y `context.get`.
- `context.priors()` (`packages/agent/context.ts`) devuelve rango de duración, loop, energía máxima, intents de cámara sugeridos, legibilidad facial, perfil de entrega y reduced-motion.
- Son **priors, no reglas**. Se usan en:
  - avisos `MAI_CONTEXT_*` de la crítica, que nunca bloquean;
  - `scene.inspect`;
  - `mai://context/current`.
- El nombre `usage.inspect` queda reservado.

**Ramas internas** (distintas de los choice boards):
- `variation.branch {name, plan}` hace un dry-run y guarda el snapshot del draft más filmstrip, crítica y verify en `.cache/branches/<id>.json`.
- `variation.compare {branches, count}` genera una hoja con una fila por rama y una tabla de scores deterministas, sin juicio estético.
- `variation.promote {branch, expectedRevision}` hace commit con CAS.
- `variation.discard`.
- Una rama queda stale si cambia la revisión base.

### F4: MCP v2, skills de dirección y biblioteca de estudios (M)

**MCP** (`packages/mcp/server.ts`). Se mantiene el `Server` de bajo nivel: el SDK 1.32 ya exporta todos los schemas necesarios (verificado).
- Capabilities: `resources {subscribe, listChanged}`, `prompts` y `completions`.
- **Resources fijos:** `mai://scene/summary`, `mai://context/current`, `mai://timeline`, `mai://operations`, `mai://expr/functions` (catálogo `EXPR_FUNCTIONS`).
- **Templates:**
  - `mai://part/{ref}`;
  - `mai://property/{part}/{prop}`: keys, evaluado y velocidad;
  - `mai://operation/{type}`;
  - `mai://preset/{name}`: `PRESET_CATALOG` más una expansión en dry-run;
  - `mai://curve/{name}`;
  - `mai://shot/{intent}`;
  - `mai://study/{id}`;
  - `mai://capability/{tool}`;
  - `mai://artifact/{id}`: blob PNG.
- Las lecturas van por `GET /api/agent/resource?uri=`. `notifications/resources/updated` se dispara con los eventos de revisión del WebSocket de la sesión; VectorCraft no puede hacerlo y MAI sí.
- **Prompts:** `animate-character-idle`, `cinematic-reveal`, `refine-until-alive`, `preserve-and-express`, `direct-a-shot` y `deliver-for-game`.
- **Completions** desde catálogos vivos: partes, propiedades, presets, curvas, shots, efectos, capas y drivers. Se ordenan por prefijo y luego por substring, con un máximo de 100.
- Se extiende `tests/transports.test.ts` con el `Client` del SDK.

**Skills:**
- **`motion.md` se reescribe** como playbook de dirección:
  - ciclo UNDERSTAND→DIRECT→AUTHOR→OBSERVE→VERIFY→CRITIQUE→REFINE→VALIDATE→COMMIT;
  - beats, arcos, overlap, holds, espaciado y peso;
  - motivación de cámara y priors;
  - cómo convertir el brief en aserciones;
  - cuándo parar;
  - nunca describir sin haber mirado.
- **Referencias nuevas:**
  - `camera.md`;
  - `observe.md`;
  - `curves.md`: vocabulario snappy/heavy/floaty en forma de handles;
  - `expressions.md`;
  - `verify.md`;
  - `context.md`;
  - `studies.md`.
- **Migración.** Las 9 skills escritas a mano pasan a `skills-src/`: SKILL.md→SKILL.src.md, `{{tool:}}`, `npm run skills` y `tests/skills.test.ts` las cubre. De paso se corrigen afirmaciones viejas.
- **Docs a actualizar:** `AGENTS.md`, `docs/CLI.md`, `docs/STATUS.md`, `MOTION.md` y `docs/AGENT-ROADMAP.md`, mapeando F0–F5 a V4/V5.

**Biblioteca de estudios.** Sirve para convertir la magia ocasional en patrones reutilizables.
- `study.save {from: revision|branch, notes}` solo con aprobación humana.
- Guarda `studies/<id>/study.json` (contexto, brief, plan, aserciones, crítica, veredicto) más `filmstrip.png`.
- Se semilla con 3–5 estudios del benchmark, marcados como pendientes de revisión visual.

### F5: Entrega y cierre (S–M)

- Variante **reduced-motion** en el export, como archivo aparte o como `@media (prefers-reduced-motion)` embebido. Se verifica en Chromium, Firefox y WebKit (patrón de `tests/compatibility.test.ts`).
- Features nuevas en `compat.ts`, resúmenes en el IR y matriz de export (Anexo A §13).
- Re-benchmark final contra la baseline en ambos agentes.
- Herramientas a `stable` solo con evidencia.
- **Futuro, fuera de este plan:**
  - exportador Lottie, vía el contrato `lottieSegment`;
  - runtime JS interactivo y state machines;
  - transferencia de movimiento desde video de referencia;
  - `usage.inspect`;
  - graph editor (V5);
  - `<animateMotion>` nativo como modo de fidelidad.

## Archivos críticos

- **Motor.** Se modifican `model.ts`, `animation.ts`, `document.ts`, `export.ts`, `identity-guard.ts`, `semantic.ts`, `authoring.ts`, `secondary.ts`, `expression.ts`, `critique.ts`, `detectors.ts`, `compat.ts`, `agent.ts` y `geometry.ts`.
  - Nuevos: `curves`, `mix`, `procedural`, `expr`, `graph`, `motion-path`, `camera`, `timing`, `effects`, `presets`, `envelope`, `motion-ops` y `verify`.
  - Ya existe `packages/core/signals.ts` con las señales de estado del agente, por eso las señales procedurales van en `procedural.ts`.
- **Superficie.**
  - Se modifican `packages/agent/registry.ts`, `service.ts` (`renderFrames`, `commit`, `t_*`) y `plan.ts`.
  - Nuevos: `compilers/`, `context.ts` y `schemas/{motion-plan.v2,context.v1}.schema.json`.
  - Nuevo `packages/core/schemas/operations.v1.schema.json`.
  - Se modifican `packages/server/render.ts`, `perceptual.ts`, `server.ts` (rutas de resource y catálogo) y `packages/mcp/server.ts`, y se crea `packages/server/observe.ts`.
  - CLI: `packages/cli/agent.ts` y `main.ts`.
- **Skills y benchmark.**
  - `skills-src/**`, `scripts/build-skills.ts` y `tests/skills.test.ts`.
  - `benchmarks/motion/**` y `scripts/motion-bench{,-verify}.ts`.
- **Editor**, cambio mínimo en `apps/editor/src/App.tsx`: lista de easings, guía de cámara y caché de sesión.

## Verificación

- **En cada fase:**
  - `npm run test` y `npm run typecheck` (obligatorio por AGENTS.md);
  - `npm run skills` sin drift;
  - `tests/transports.test.ts`: paridad CLI/HTTP/MCP y número de tools;
  - `tests/compatibility.test.ts`: Chromium, Firefox y WebKit.
- **Golden de F0.** Sin datos nuevos, `frameState` y el export quedan idénticos.
- **Por feature** (detalle en el Anexo A):
  - determinismo con semilla;
  - costura del loop en valor y velocidad;
  - round-trip editable → reabrir;
  - standalone SMIL vs `frame()` en Chromium;
  - identidad con partes protected/locked, desviación transitoria y cámara/efectos que no bloquean;
  - seguridad del DSL;
  - aserciones que pasan y que fallan;
  - filmstrip con N celdas;
  - fallback sin ffmpeg;
  - rendimiento por frame en el editor.
- **End-to-end con el MCP real.** En Claude Code y en Codex, sobre un gato del juego:
  - pedir "un idle que se sienta vivo para el inventario" y "un reveal cinematográfico";
  - comprobar que el agente usa contexto, aserciones, filmstrip, trail y ramas;
  - comprobar que `identity.check` da pass y que el standalone se ve igual que el motor;
  - mirar los filmstrips antes de afirmar nada.
- **Benchmark.** `scripts/motion-bench.ts --agent claude|codex` al cierre de cada fase, comparado con la baseline. La meta es menos dirección de bajo nivel sin perder fidelidad. Lo estético lo aprueba el humano.

## Operativa

- **Repos de referencia.** Se clonan en el scratchpad, no se vendorizan.
- **Cuenta de gh.** Cualquier push o PR se hace con la cuenta **Ragosorio**. Hoy la activa es `rolando-osorio-roo`, así que antes de pushear hay que correr `gh auth switch --user Ragosorio`.
- **Límites.**
  - No tocar `/Users/roor.osorio/Desktop/No one`.
  - No commitear los assets sin trackear de `assets/vector` ni de `exports/game-rigs` salvo que se pida.

## Fuentes

- **Informe base:** `deep-research-report (1).md`.
- **Repos estudiados** (solo conceptos):
  - VectorCraft `docs/mcp.md`: resources granulares, prompts, completions, `run_command`.
  - EffectCraft `docs/agents.md`, `crates/keyframe`, `crates/expr` y cámara: `describe_command` con JSON Schema, `batch` atómico, `get_property` evaluado, `render_frame`.
  - svg-character-animator: recetas de idle y blink con semilla.
  - tracing-video-to-animated-svg: hoja con mezcla al 50 %, sonda rAF, "medir y juzgar en movimiento".
  - remotion-dev/skills: `timing.md` (escala perceptual, interpolate/spring) y `motion-blur.md` (shutter y samples); abrir el preview temprano.
- **Papers:**
  - MoVer (arXiv 2502.13372): verificación con predicados y refinamiento iterativo.
  - LogoMotion (arXiv 2405.07065): síntesis anclada en lo visual y reparación.
  - Keyframer (arXiv 2402.06071): prompting descompuesto, variantes, edición directa + lenguaje.
  - van Wijk & Nuij, "Smooth and efficient zooming and panning".
- **Especificaciones y librerías:**
  - Spec de keyframes de Lottie.
  - GSAP MotionPath, CustomEase e Inertia.
  - Motion Canvas signals.
  - Rive: state machines, constraints, mixing.
  - Carbon y Fluent motion: productivo vs expresivo.

---

## Anexo A: Diseño del motor v2 (contrato para ADR-003)

### A.0 Decisiones

| # | Decisión | Por qué |
|---|---|---|
| D1 | Grafo perezoso de canales (`graph.ts`). Toda contribución a `(target, property)` es un nodo: tracks, paths, señales, expresiones, drivers y secondary. La mezcla sigue las reglas de capas actuales y los ciclos se detectan. | Cadenas, expresiones, paths y cámara necesitan valores evaluados de otras partes. Hoy los drivers solo leen tracks crudos. |
| D2 | Keyframe v2 con semántica AE/Lottie: `in`/`out {speed, influence}`, `auto`, `roving`, `curve`. Hold = `easing:'step'`. Cada easing legado se mapea exacto a handles. | Lottie sin pérdida y proyectos viejos bit-idénticos. |
| D3 | El movimiento espacial se queda como pistas x/y separadas más objetos `MotionPath`. No hay `to/ti` en las pistas. | Acoplar pistas rompería `track.edit`, `retime` y la mezcla. Los arcos los dan los paths. |
| D4 | Cámara = target reservado `@camera` (`safeId` rechaza `@`, así que no puede colisionar), con props x, y, rotation y una Property nueva `zoom`. | Un solo modelo de mezcla. El zoom perceptual lo da van Wijk en el compilador de shots. |
| D5 | El DSL complementa las cadenas de secondary. Ambos comparten grafo y simulación de spring. | Secondary conserva su física y presets; el DSL cubre relaciones arbitrarias. |
| D6 | Categorías de identidad nuevas: `view` (cámara y overlays, siempre permitida) y `effects` (permitida salvo en `locked` o si el envelope lo prohíbe). | La cámara y los overlays no cambian el arte. |
| D7 | `effect.stack` es una macro transparente sobre `filter.set` + señales. Echo/trail son fantasmas generados con `<use>`. | No se duplican IDs y se limpian al reabrir. |
| D8 | El proyecto sigue en `version:1`. Todos los campos nuevos son opcionales y se validan en `validateAuthoring`/`validateNode`, porque la metadata no es confiable. | Es el patrón de adiciones previas: los campos desconocidos sobreviven al round-trip (verificado). |

### A.1 Hechos verificados que condicionan el diseño

- `packages/core/signals.ts` ya existe: son los siguientes pasos del agente, importados en `service.ts:14`. Las señales procedurales van en `procedural.ts`.
- Orden actual de `frameState`:
  1. tracks → `mixTracks`;
  2. `frameParams`;
  3. `evaluateRig` (los drivers pisan los tracks vía `Object.assign`);
  4. secondary `+=` con driver leído de tracks crudos y caché con fingerprint de 24 muestras;
  5. modificadores;
  6. huesos, mesh y skins.
- **Export.**
  - Los `poseIds` salen de poses, pistas de pose, targets de secondary y drivers. Una pista en `@camera` hoy lanzaría "Animation target missing".
  - `sampled()` descarta tiempos repetidos y no exporta mezclas step + continuo. El filtro de flow ya usa keyTimes repetidos para saltos.
  - Los nodos generados llevan `data-mai-generated` y se desenvuelven al reabrir.
- `capture()` solo incluye los ids top-level de cada op. Las ops compuestas que tocan otros elementos deben ir al set `structural`.
- `verifyIdentity` compara antes y después en ≤12 tiempos; no existe un presupuesto absoluto. Los presupuestos de landmarks solo están como soft-knee (`PRESERVATION` .12/.32/.6), y `scaleBudget` (.02/.05/.15) aplica a los ancestros.
- `pathBoxes` cachea bboxes de los puntos de control de `d` crudo. No hay bounds en espacio mundo.
- Se reutilizan:
  - `rng(seed)` y la convención de ciclos enteros de `modifiers.ts`;
  - `segments` y `transformPath` de `geometry.ts`;
  - los drivers `attr:NAME` (`DRIVER_ATTRS`).

### A.2 Módulos nuevos (`packages/core/`, puros)

| Módulo | Contenido |
|---|---|
| `curves.ts` | `ease` e `isEasing` movidos y reexportados, `valueAt` v2, `velocityAt`/`accelerationAt`, CustomEase, auto/roving, `lottieSegment`, `inertiaKeys` |
| `mix.ts` | `layersOf`, `mixChannels`, `mixTracks` |
| `procedural.ts` | Noise hash, fuentes, envelopes, schedules de blink/pulse, estimación de coste de export |
| `expr.ts` | Tokenizer, Pratt parser, binder, evaluador, límites, `ExpressionError` |
| `graph.ts` | `evalSession`, `animatedTargets`, `channelSeries`, `detectCycles` |
| `motion-path.ts` | Tablas de longitud de arco, Catmull-Rom centrípeto |
| `camera.ts` | Matrices, parallax, van Wijk, framing, `compileShot`, `fitView`, `cameraReport`, wrappers DOM |
| `timing.ts` | `sceneTime`, beats, `actingBeat`, `significantTimes`, `restPoints`, `transientBoost` |
| `effects.ts` | Catálogo, `compileEffectStack`, ghosts, `effectReport`, `effectCategoryOf` |
| `presets.ts` | `PRESET_CATALOG`, `expandPreset` |
| `envelope.ts` | `policyFor`, `verifyEnvelope`, `envelopeReport` |
| `motion-ops.ts` | Validación y aplicación inline de todas las ops nuevas, para que `document.ts` siga delgado |

Tipos compartidos en `model.ts`:
- `CAMERA_TARGET='@camera'`;
- `Property` + `'zoom'`;
- `ChannelProperty = Property | attr:${string}`;
- `Ref` = `channel | param | signal | camera | world {target, axis, chain?, anchor?}`. Las cadenas de ancestros de `world` las resuelve la op y las refresca `refreshWorldRefs()` tras cada transacción.

### A.3 Nuevo orden de `frameState` (misma firma; `FrameOptions` + `session?`, `signals?`, `camera?`)

```
0  t0 = clamp(time,0,D)
1  τ  = sceneTime(p,t0)            // identidad sin timeRemap; τc = t0 si timeRemap.scope==='scene'
2  S  = options.session ?? evalSession(p,options);  E = S.at(τ)
3  params = E.params()             // defaults → pistas/señales de param por capa → clamp → overrides
4  attrs d/fill/stroke como hoy (mixTracks)
5  rig = evaluateRig(..., f=>transientBoost(p,f,τ))   // boost≡1 sin envelopes → idéntico
6  poses: por target animado, E.channel = mezcla por capas → override de driver → + secondary (con peso de su capa)
7  huesos animados vía E.channel; meshes como hoy
8  attrs numéricos: opacity con señales y salidas attr:* ("c0 c1")
9  ghosts (echo): poses en S.at(wrap(τ−kΔ)) + caída de opacidad
10 modificadores (sin cambios)   11 matrices de huesos, skins (sin cambios)
12 camera = cameraState(p, S.at(τc)) si hay cámara
return {poses,attrs,bones,meshes,matrices,params,camera?,ghosts?,time:{input,scene,camera}}
```

**Grafo.**
- Los contribuyentes de un canal son tracks (en orden del array), paths y señales (ordenadas por id). Cada uno tiene `layer`, `value(τ, acc)` (`acc` = el `value` del DSL) y un `weight` opcional.
- Valores de reposo: `project.poses`, campo del hueso, default del param, opacidad base, reposo de cámara, `output.base`.
- Memoización por τ con un LRU de 64. Un visiting-set detecta `MAI_EXPR_CYCLE`, y `detectCycles()` corre al construir y en `validateAuthoring`.
- Cachés globales:
  - AST por string;
  - tablas de path por `d`;
  - springs por definición + fingerprint de 24 muestras, para que las cadenas tengan coste lineal.

### A.4 Keyframe v2 y curvas

```ts
type Ease={speed:number;influence:number};  // unidades/s; influence ∈ [0.001,1]
type Keyframe={time;value;easing;in?:Ease;out?:Ease;auto?:'auto'|'continuous';roving?:boolean;curve?:string}
type KeyInput=Keyframe-like + {easing?;hold?:boolean}
```

- Las pistas string (`d`, fill, stroke) solo aceptan `easing`, `hold` y `curve`.

Mapa exacto legado → cúbica normalizada, con x en 1/3 y 2/3 (`LEGACY_BEZIER`):

| Easing | Cúbica |
|---|---|
| linear | (1/3, 1/3, 2/3, 2/3) |
| ease-in-out | (1/3, 0, 2/3, 1), exactamente smoothstep |
| ease-in | (1/3, 0, 2/3, 1/3) |
| ease-out | (1/3, 2/3, 2/3, 1) |
| overshoot | (1/3, 1.567193, 2/3, 1) |
| anticipate | (1/3, 0, 2/3, −0.567193) |
| cubic-bezier | ella misma |

Conversión: `out = {influence:x1, speed:y1·Δv/(x1·dur)}` e `in = {influence:1−x2, speed:(1−y2)·Δv/((1−x2)·dur)}` (`legacyHandles`).

**Ops:**
- `track.set {target, property, layer?, keys}` (con `[]` borra la pista);
- `key.tangent {…, time, in?, out?, auto?, roving?, easing?, hold?}`;
- `curve.custom {…, time, curve:"M0,0 C… 1,1"|null}`;
- `curve.inertia {…, time, velocity?, to?, resistance?, tolerance?}`. Es un compilador: decaimiento exponencial `x0 + v0/k·(1−e^{−k(t−t0)})`, la velocidad de entrada por defecto es la incoming (`velocityAt`) y las influencias se ajustan con una grilla 20×20.

**`valueAt` por segmento**, en orden de prioridad:
1. `step` → hold.
2. `curve` → CustomEase, con y sin clamp.
3. Handles o auto → bezier AE en el espacio (tiempo, valor): P1 = (i0, va+s0·i0·dur), P2 = (1−i1, vb−s1·i1·dur). Se resuelve con 40 bisecciones (monotónico); los lados faltantes salen de `legacyHandles`.
4. Si no, el `ease()` legado, sin tocar.

**Auto, roving y edición:**
- **auto:** pendiente Catmull-Rom con influencia 1/3. En un loop con extremos iguales, los vecinos se envuelven, lo que da continuidad de velocidad en la costura.
- **continuous:** speed de entrada = speed de salida.
- **roving:** reparte los tiempos interiores por |Δv| acumulado.
- **Ops existentes conscientes de handles:**
  - `stretch`: speeds ÷ f;
  - `scale`: speeds × k;
  - `reverse`: intercambia y niega;
  - `retime`, `track.copy` y `clip.place` copian y escalan.

**Export.** `S.jumps` marca el fin de cada segmento step con cambio de valor. `sampled()` emite el límite izquierdo y un keyTime duplicado.

### A.5 Motion paths

```ts
type MotionPath={id;target;d?;points?;closed?;tension?;progress:Keyframe[];orient?:{offset}|false;anchor:Point;offset?;mode:'absolute'|'relative';layer;enabled?}
Project.motionPaths?:MotionPath[]   // ≤128
```

**Ops:**
- `motion.path {id, target, d?|points?, closed?, tension?, start?, end?, easing?, progress?, orient?, anchor?:Point|'pivot'|'center'|'bottom-center', offset?, mode?, layer?}`;
- `motion.path.remove`;
- `motion.path.bake {id, tolerance}`.

**Valores por defecto:**
- `layer` es `pose` (aditivo) y el modo es absolute;
- si `orient` y el pivote difiere del ancla, se fija el pivote al ancla (op `pose`, rígida);
- una pista x/y en la misma capa → error de colisión.

**Evaluación.** `pathTable(d)` (en caché):
- aplana segmentos y construye la tabla de longitud de arco y el ángulo desenrollado;
- en paths cerrados cada vuelta suma 360°·winding;
- contribuye x/y = `P(s)+offset−anchor` (relative: `P(s)−P(s0)`) y rotation = ángulo + offset.

**Identidad y crítica.** Se clasifica como `rigid`. La crítica emite `MAI_PATH_ORIENT_FLIP` si hay saltos de más de 90°.

### A.6 Señales procedurales (`procedural.ts`)

```ts
type SignalOutput={target;property:'x'|'y'|'rotation'|'scaleX'|'scaleY'|'opacity'|'bone*'|'zoom'|'param'|`attr:${string}`;layer(obligatoria);component?;base?}
type SignalEnvelope={start?;end?;fadeIn?;fadeOut?;decay?;gain?;bias?;multiplyBy?:'param:N'|'signal:ID';clamp?;ramp?:Keyframe[]}
type SignalSource=noise{frequency,amplitude,octaves?,persistence?,seed}|wiggle{…}|oscillator{wave,period,amplitude,phase?,softness?}
 |pulse{interval:[min,max],width,amplitude,seed,shape?}|blink{interval,close,hold?,open?,double?,amplitude,seed}|drift{amplitude,period,seed?}|curve{keys}|expr{expr}
Project.signals?:Signal[]   // ≤256 (≤64 expr)
```

**Ops:**
- `signal.add`, `signal.update`, `signal.remove`;
- `signal.bake` (rechazado para `attr:`).

**Capa nueva:** `camera-shake` (aditiva).

| Fuente | Cómo funciona | Cómo cierra el loop |
|---|---|---|
| noise/wiggle | Lattice hash con fade quíntico (C2) y octavas f·2^k | Periodo N_k = max(1, round(f·D))·2^k con índice mod N_k: exacto y C2 en la costura |
| oscillator | — | Ciclos enteros |
| blink/pulse | Schedule con `rng(seed)`; cierre ease-in, hold, apertura 1.6× más lenta, doble parpadeo opcional | Eventos completos dentro de [0, D] |
| drift | 3 senos .5/.3/.2 | Sin loop: periodos p, 1.618p, 2.414p. Con loop: ciclos enteros coprimos |

**Envelope.** Ventana, fades smoothstep, decay, ramp y multiplyBy. En capas override el envelope es el peso de mezcla, lo que da crossfade sin pop.

**Coste.** `estimateSamples` y el detector `MAI_SIGNAL_EXPORT_COST`.

**Identidad**, según la salida:
- x/y/rot → rigid;
- scale → scale;
- opacity → visibility;
- bone → geometry;
- @camera → view;
- param → `paramImpact`;
- attr → `effectCategoryOf`.

### A.7 DSL de expresiones (`expr.ts`, solo números, sin `eval`)

**Gramática** (Pratt):
- precedencia: `|| && == != < <= > >= + - * / % unario ^`, con `^` asociativo a la derecha;
- ternario `?:`.

**Variables:** `t`, `time`, `frame`, `duration`, `fps`, `loopPhase`, `value`, `PI`, `TAU`, `E`.

**Referencias:**
- `ID.x|y|rotation|scaleX|scaleY|opacity`;
- `param.N` o `param('a-b@slot')`;
- `camera.*`;
- `sig.ID`;
- `ref('id','boneRotation')`.

**Funciones:**
- **Matemáticas:** sin, cos, tan, asin, acos, atan, atan2, abs, sign, floor, ceil, round, fract, min, max, pow, sqrt, exp, log, mod, deg, rad.
- **Forma:** clamp, mix/lerp, map/linear, smoothstep, step, `ease('name', u)`.
- **Procedurales:** noise, wiggle, pulse, random.
- **Temporales:** `delay(REF,s)`, `spring(REF,k,c)`, `smooth(REF,T)`, `velocity(REF)`, `accel(REF)`, `valueAt(REF,t)`.
- **Mundo:** wx, wy, wrot, distance, angle.

**Reglas:**
- Los argumentos de las temporales y de noise deben poder plegarse a constante (`MAI_EXPR_NONCONSTANT`).
- División por 0 y resultados no finitos dan 0 (con diagnóstico).
- Las temporales se simulan con el núcleo compartido `simulateSpring` (120 fps, 3 pasadas y corrección de deriva en loop).

**Límites:**
- 1000 caracteres, 512 tokens, 256 nodos, profundidad 24;
- 8 temporales y 32 referencias por expresión;
- profundidad de grafo ≤64.

**Errores:** `MAI_EXPR_SYNTAX`, `UNKNOWN_IDENTIFIER`, `UNKNOWN_FUNCTION`, `ARITY`, `TOO_COMPLEX`, `NONCONSTANT`, `BAD_REFERENCE`, `MISSING_TARGET` y `CYCLE` (este último con la ruta del ciclo). Se publica el catálogo `EXPR_FUNCTIONS`.

### A.8 Cadenas de overlap

- `Secondary` gana los campos `source?:Ref`, `chain?` y `driverSource?:'tracks'|'evaluated'`; sin ellos se mantiene el comportamiento legado.
- `motion.propagate {id, driver:Ref, links:ChainLink[1..12], layer?, replace?}` compila a Secondary `${id}-${i}`. El link i usa como fuente el canal final del link i−1, así que el overlap se propaga de verdad.
- El driver puede ser una señal, un param, un hueso o un `world`, con los padres incluidos.
- `Secondary.layer` aplica peso, mute y solo.
- Tests: los picos crecen a lo largo de la cadena y un ciclo da error.

### A.9 Cámara 2.5D (`camera.ts`)

```ts
type CameraConfig={view:{x,y,width,height}(del viewBox);anchor?;safeArea?:{action,title};minZoom?;maxZoom?;
 planes?:{id,depth,factor}[];depth?:{target,plane}[];subject?;overlays?:{kind:'vignette',strength,softness?,color?}[]}
DEFAULT_PLANES: background(-1,.2) · midground(-.5,.55) · subject(0,1) · foreground(1,1.35)
```

**Matrices:**
- Principal: `M = T(P)·R(−r)·S(z)·T(−c)`, que es la identidad en reposo.
- Por plano f: `c_f = P + f(c−P)` y `M_f = T(P)·R(−r)·S(z^f)·T(−c_f)`.
- Wrapper relativo entre planos: `translate(c_a − s·c_b)·scale(s)` con `s = z^{b−a}`.

**Ops:**
- `camera.set {camera|null}`;
- `camera.depth {target, plane|null}`;
- `camera.shot {shot}`;
- `camera.fit {targets, padding?, time?, easing?, hold?}`;
- `keyframe`/`track.set` sobre `@camera` crean la cámara desde el viewBox (`assertTrackTarget` es compartido).

**van Wijk** (sin d3, ρ = √2). Las vistas son (x, y, w), con w = view.width/zoom.
- Pan nulo (d² ≈ 0): `S = ln(w1/w0)/ρ`.
- En general:
  - `b0 = (w1² − w0² + ρ⁴d²)/(2w0ρ²d)` y `b1 = (w1² − w0² − ρ⁴d²)/(2w1ρ²d)`;
  - `r_i = ln(√(b_i²+1) − b_i)`;
  - `S = (r1 − r0)/ρ`;
  - `u(s) = w0/(ρ²d)·(cosh r0·tanh(ρs + r0) − sinh r0)`;
  - `w(s) = w0·cosh r0/cosh(ρs + r0)`.
- Duración sugerida: S·0.9 s.

**Framing:** wide = bbox de la escena; medium = 60 % del alto; close-up = cabeza/cara del sujeto al 90 %; extreme = 140 %. Admite offset de tercios.

**`partBounds()`** es nuevo en `semantic.ts`: `pathBoxes` llevados a mundo con las matrices de pose.

**`compileShot`** devuelve `{tracks, signals, notes}` y reemplaza las keys dentro de la ventana del shot:

| Intent | Resultado |
|---|---|
| establish | Plano wide con push 1→1.05 |
| reveal / push-in / pull-out / pan | van Wijk con N = clamp(round(6·dur)+2, 4, 24) keys `auto`, que crece hasta un error menor de 0.5 px |
| follow | Señales expr `smooth(wx(S), lag)` con crossfade |
| orbit-2d | Roll ±8°·i más un arco del centro |
| impact | Punch de zoom con overshoot y oscilador decaído en `camera-shake` |
| handheld | Noise x/y/rot en `camera-shake`, consciente del loop |
| cut | Hold y luego salto |

`motion` = smooth / snappy / lazy / linear, que se traducen a conjuntos de handles.

**`cameraReport`:** `MAI_CAMERA_SUBJECT_OUTSIDE` (>15 % fuera del safe area durante >.25 s), `FAST` (>1.2 anchos/s), `ZOOM_RATE`, `ZOOM_RANGE`, `JERK`, `LOOP_SEAM`, `ROLL`.

**Render:**
- **`frame()`.** `applyCameraDom` solo actúa si hay cámara; sin ella el resultado es byte-idéntico al de hoy. Pone primero los wrappers `parallax` alrededor de cada grupo de hermanos consecutivos del mismo plano, después `g#mai-camera` alrededor de los hijos raíz (excepto defs, metadata, title, desc y style), y al final los overlays.
- **Export.** La misma estructura, con SMIL muestreado adaptativamente. El error se mide con las 4 esquinas de la vista. Paint order, IDs y `url(#)` quedan intactos. El modo editable desenvuelve todo al reabrir.
- **Editor.** Guía de encuadre y safe area, más un toggle de vista de cámara aproximada.

**Identidad:** todo es `view`. Funciona incluso con la escena entera en `locked`.

### A.10 Beats y tiempo (`timing.ts`)

```ts
type Beat={id;kind:'anticipation'|'action'|'overshoot'|'settle'|'hold'|'reaction'|'accent';start;end;targets?;intensity?;label?;region?}
Project.beats?:Beat[](≤500);  Project.timeRemap?:{keys:Keyframe[];scope?:'scene'|'all'}
```

`TimeRegion.mode` sigue sin evaluarse: evaluarlo cambiaría archivos viejos.

**Ops:**
- `beat.set` y `beat.delete`;
- `time.remap {keys|null, scope?}`;
- `time.freeze {start, end, at?, resume:'skip'|'delay'}` y `time.reverse {start, end}`, que se compilan como curvas de remap;
- `acting.beat`.

**`acting.beat {target, property, layer?, start, duration, action, rest?, anticipation?, overshoot?, timing?, hold?, bounces?, beats?}`**, con defaults:
- anticipación = rest − .2·(action − rest);
- overshoot = action + .1·(action − rest);
- timing .3/.15/.2/.35.

| Key | Tiempo | Valor | Handles |
|---|---|---|---|
| k0 | inicio | rest | out {0, .4} |
| k1 | fin de la anticipación | anticipación | in {0, .5}, out {0, .55} |
| k2 | fin de la acción | action | `auto` (continuidad de velocidad) |
| k3 | fin del overshoot | overshoot | in/out {0, .35} |
| k4 | fin | action | in {0, .65} (settle largo) |

`bounces` agrega rebotes que decaen ×−.35. Opcionalmente emite los beats.

**Helpers:**
- `sceneTime` se aplica en el paso 1, así que un freeze congela también springs y señales;
- `significantTimes(p)`: filmstrip y aserciones;
- `restPoints(p, targets)`: 0, D, fin de settle, holds y holds step;
- `timeline.retime` reescala handles, beats, paths, remap y frecuencias de las señales.

**Crítica:**

| Código | Regla | Severidad |
|---|---|---|
| `MAI_BEAT_HOLD_MOTION` | Velocidad en el hold > .15× el pico | info |
| `MAI_BEAT_NO_ANTICIPATION` | Acción ≥.6 sin anticipación previa en .5 s | — |
| `MAI_BEAT_OVERSHOOT_NO_SETTLE` | Overshoot sin settle | — |
| `MAI_BEAT_TOO_SHORT` | Beat de menos de 2 frames | — |
| `MAI_BEAT_ORPHAN` | Beat huérfano | — |

### A.11 Efectos (`effects.ts`)

- `effect.stack {id, target, effects[1..8], replace?}` y `effect.remove` (ambos `structural`).
- Se instala un filtro `fx-<id>` por la ruta de `filter.set`. Los parámetros animados se vuelven señales `attr:` sobre las primitivas.

| Kind | Primitivas | Categoría | Coste |
|---|---|---|---|
| blur | feGaussianBlur | effects | moderado |
| glow | blur(SourceAlpha) + flood + composite + merge | effects | moderado |
| shadow | feDropShadow | effects | barato |
| displace | turbulence + displacementMap | geometry | alto |
| turbulence | textura | style | alto |
| colorMatrix | feColorMatrix | style | barato |
| chromaticOffset | 3 matrices + 2 offsets + blend | effects | moderado |
| motionSmear | blur con `stdDeviation = min(max, k·\|velocity\|)` por eje | effects | moderado–alto |
| light | diffuseLighting + pointLight | style | alto |
| echo/trail | ≤8 fantasmas `<use>` con retraso y caída (opcionalmente solo en movimiento); exactos en pose rígida | effects | barato por fantasma |
| vignette | Solo con `@camera`, como overlay | view | barato |

- **Errores.** Un target que ya tiene filtro da error salvo con `replace`.
- **Compatibilidad.** `effectReport` indica la compatibilidad por target (standalone/sprite nativo; Lottie nativo, horneado o descartado) y el coste. Hay features nuevas en `compat.ts`.
- **Identidad.** Los cambios en un filtro `data-mai-effect` se clasifican por `effectCategoryOf`.

### A.12 Presets transparentes (`presets.ts`)

`expandPreset(kind, target, opts, ctx) → {ops, notes, pieces:{name, why, ops}[]}`, con `PRESET_CATALOG` (summary, teaches, options). `motion.preset` pasa a `structural` y gana `kind:'idle'`, `options` y `style:'classic'`. Los kinds legados emiten las mismas keys que hoy (lo cubre el golden).

**`breathe` nuevo** (periodo 3.5 s, ciclos enteros):
1. Pivote abajo al centro.
2. `scaleY` en `pose`, asimétrico: pico al 42 %, con handles.
3. `scaleX` contrario de −.4a.
4. Overlap de la cabeza retrasado .06·periodo.
5. Deriva de rotación de .35°.

**`idle`** = breathe más:
- parpadeo con semilla compartida para ambos ojos: −.92 scaleY en `blink`, cada 2.8–5.2 s, doble 15 %;
- mirada sobre `look-x`/`look-y` si existen;
- orejas y cola con `motion.propagate`.

Cada pieza pasa por `ctx.allows()`. Si se salta, deja una nota del tipo "blink saltado: ojo protegido; usa envelope deform:'bounded' + transientDeviation".

### A.13 Creative Envelope (`envelope.ts`)

```ts
type ChannelPolicy='free'|'bounded'|'preserve'
type CreativeEnvelope={rigidTransform?;deform?;paint?;topology?;effects?;visibility?;invariants?:string[];
 bounds?:{translate?,rotation?,scale?,deform?,paint?,opacity?};transientDeviation?:{allowed;mustRecover?;maxDuration?(.5s);maxPeak?(2.0)}}
SemanticNode.envelope?;  op semantic.envelope {id, envelope|null, replaceLevels?}
```

**Mapeo de canales a categorías:**

| Canal | Categorías |
|---|---|
| rigidTransform | rigid |
| deform | scale, geometry |
| paint | style |
| topology | topology, structure |
| effects | effects |
| visibility | visibility |

**Política y guardias:**
- `policyFor(levels, envelope)`: gana la regla más estricta. `view` siempre es free.
- `guardIdentity` y `verifyIdentity` permiten todo lo que no sea preserve.
- Lo `bounded` no pasa por la comparación delta: pasa por `verifyEnvelope`, que también corre cuando la misma transacción afloja la política, así se cierra el agujero de "aflojar y animar a la vez".

**Métricas** (≤240 muestras más los puntos de reposo y bordes de beat, con una `EvalSession`):
- desplazamiento y rotación del ancla;
- escala por valores singulares de la matriz mundo, ancestros incluidos;
- landmarks invariantes contra el punto de control más cercano, divididos por el tamaño del nodo;
- ΔE de pintura;
- |Δopacity|.

**Reglas transitorias.** Un tramo que excede el presupuesto se acepta solo si:
- `allowed` es true;
- su pico es ≤ presupuesto·maxPeak;
- dura ≤ maxDuration;
- si `mustRecover`, no contiene ningún punto de reposo (el fin del loop envuelve a 0).

Si no, `IdentityError IDENTITY_BLOCKED` con `detail.kind:'transient'`.

**Otros efectos:**
- **`transientBoost`** multiplica el presupuesto de landmarks dentro de los beats de acción (rampa de .08 s) y vale 1 en settle y hold. El reposo queda exacto.
- **`envelopeReport`** alimenta la crítica (`MAI_TRANSIENT_UNRECOVERED` es un error).

### A.14 Compatibilidad y migración

**Ops nuevas** (106 → 131): `acting.beat`, `beat.delete`, `beat.set`, `camera.depth`, `camera.fit`, `camera.set`, `camera.shot`, `curve.custom`, `curve.inertia`, `effect.remove`, `effect.stack`, `key.tangent`, `motion.path`, `motion.path.bake`, `motion.path.remove`, `motion.propagate`, `semantic.envelope`, `signal.add`, `signal.bake`, `signal.remove`, `signal.update`, `time.freeze`, `time.remap`, `time.reverse`, `track.set`. Cada una entra con su `$def` en el schema de F0.

**Validación.** `validateAuthoring` → `validateMotion`, en `motion-ops.ts`. `validateNode` valida el envelope.

**Detectores:**
- `MAI_ORPHAN_TRACK` ignora `@camera`.
- Nuevos: `MAI_ORPHAN_SIGNAL`, `ORPHAN_PATH`, `ORPHAN_CAMERA_DEPTH`, `BEAT_ORPHAN`, `ORPHAN_EFFECT`, `SIGNAL_EXPORT_COST`, `SIGNAL_LOOP_FADE` y `STALE_WORLD_REF`. `cleanupDeleted` filtra todo.

**Documento:**
- un set `motionTypes` enruta a `motionOperation`;
- `timeline` y `retime` cubren los tiempos nuevos;
- `canvas` actualiza `camera.view`;
- `apply()` llama `refreshWorldRefs`;
- las ops `time.*` entran en `globalOps` de `captureIdentity`.

**Compat (features).**
- Features nuevas: `camera`, `camera-parallax`, `motion-path`, `signals`, `expressions`, `time-remap`, `effects-stack`, `echo` y `keyframe-handles`.
- Targets editable, standalone, sprite y png: todas.
- Lottie (planificado): handles y paths nativos; señales y expresiones horneadas.

**Export.** El reporte gana conteos de cámara, ghosts, jumps y señales.

**IR.** `buildIR` gana resúmenes de `signals`, `motionPaths`, `camera` y `beats`.

### A.15 Tests del motor (archivos nuevos)

**Archivos:** `golden`, `curves`, `procedural`, `expr`, `secondary-chain`, `springs`, `motion-path`, `camera`, `timing`, `effects`, `presets`, `envelope` y `critique` `.test.ts`.

**Qué cubren:**
- **Easings:** cada easing legado es igual a su forma con handles hasta 1e-12.
- **Determinismo:** se corre dos veces sobre documentos nuevos.
- **Costuras de loop** (valor y velocidad): auto, señales, springs, cadenas, handheld y breathe.
- **Round-trip editable** con cámara, ghosts, señales y paths.
- **Standalone vs `frame()` en Chromium:** wiggle, path con orient, zoom + roll + parallax + corte, y echo.
- **Matriz protected/locked** por op.
- **Desviaciones transitorias** que pasan y que fallan.
- **Seguridad del DSL:** `constructor`, `__proto__`, `eval`, `;`, `=`, `[`, 25 niveles de anidación, más de 256 nodos y ciclos.
- **`agent-surface.test.ts`:** se añade `deepEqual(capabilities.operationTypes, OPERATION_TYPES)`.

### A.16 Secuencia del motor y mapeo a fases del plan

| Motor | Alcance | Fase del plan |
|---|---|---|
| 0 | Golden y tests faltantes | F0 |
| 1 | curves/mix y keyframe v2 | F2 |
| 2 | graph, procedural, frameState v2 y categorías | F2 |
| 3 | expr, world refs y propagate | Carril A |
| 4 | motion-path | Carril A |
| 5 | timing y beats | Carril A |
| 8 | presets | Carril A (después de 2–3) |
| 6 | cámara | Carril B (follow/handheld después de 3) |
| 7 | efectos | Carril B (después de 2–3) |
| 9 | envelope | F3 (después de 5) |
| 10 | compat, IR y docs | F5 |
