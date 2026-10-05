# CLI y sesiones

Ejecutar desde la raíz de MAI SVG. `npm run mai -- help` enumera los comandos. `mai` en estos ejemplos significa `npm run mai --`.

```sh
mai serve                         # editor, 127.0.0.1:4318
mai session attach                # estado, revisión, capas y proyecto; no imprime token
mai objects --filter tail         # lista paginada; --offset y --limit
mai object tail                   # atributos y pose
mai apply examples/tail-wave.json --expected-revision 0
mai history
mai undo --expected-revision 1
mai redo --expected-revision 2
mai open candy_alchemist_cat --expected-revision 3 --kind vector
mai inspect assets/vector/candy_alchemist_cat.svg --json
mai validate assets/vector/candy_alchemist_cat.svg
mai export --profile editable --expected-revision 4 --output experiments/project.svg
mai export experiments/project.svg --profile standalone --output experiments/distribution.svg
mai render experiments/distribution.svg --time 1.5 --output experiments/frame.png
```

Las revisiones son ejemplos: **lee la revisión actual antes de cada transacción**. Un conflicto HTTP 409 no modifica el documento. Relee e integra la edición humana; no reintentes sobrescribiendo automáticamente. `--expected-revision` también fija el estado de export/render de sesión. Exportar/renderizar un archivo no requiere sesión.

Conversión:

```sh
mai vectorize fixtures/candy_alchemist_cat.png --preset high-color-preserved --output experiments/new-run
mai vectorize DIRECTORY --preset high-color-preserved --output experiments/batch
mai vectorize INPUT --compare --output experiments/comparison
mai gallery --directory experiments/comparison
mai serve --directory experiments/comparison --port 4317
```

`--compare` conserva los dos presets iniciales del experimento; usa `--preset high-color-preserved` para el seleccionado. Las extensiones PNG/WebP/JPG/SVG se reconocen; para un SVG se reemplazan solo sus imágenes rasterizadas, conservando efectos e IDs. Las entradas permanecen intactas. No se incluyen miniaturas que comiencen con `_`. Una entrada inválida no impide procesar las demás. Directorios con igual nombre PNG/WebP se desambiguan.

## Transacciones

Archivo JSON: arreglo de operaciones o `{ "ops": [...] }`. 1–500 operaciones atómicas. Ejemplo:

```json
[
  {"type":"attributes","id":"tail","attrs":{"fill":"#9675cf"}},
  {"type":"pose","id":"tail","pose":{"pivotX":450,"pivotY":440}},
  {"type":"keyframe","target":"tail","property":"rotation","time":0,"value":-10,"easing":"ease-in-out"},
  {"type":"keyframe","target":"tail","property":"rotation","time":5,"value":25}
]
```

El vocabulario completo y sus tipos están en `packages/core/model.ts` (`Operation`). Operaciones:

| Familia | Tipos |
|---|---|
| Formas y capas | `create`, `delete`, `attributes`, `gradient`, `group`, `ungroup`, `part.prepare`, `rename`, `lock`, `order` |
| Pose | `pose` con x, y, rotation, scaleX/Y, pivotX/Y |
| Trazos | `point.move`, `point.add`, `point.remove`, `path.curve`, `path.split`, `path.join`, `path.close`, `path.simplify`, `path.boolean` |
| Timeline | `timeline`, `keyframe`, `keyframe.delete` |
| Rig | `bone.add`, `bone.pose`, `bone.ik`, `skin.bind`, `skin.unbind`, `skin.weight`, `mesh.add`, `mesh.move` |

`create` admite path, rect, circle, ellipse, line, polygon, g. `attributes` admite solo atributos geométricos/de estilo conocidos y referencias locales; usa strings. `gradient` recibe kind linear/radial y start/end #RRGGBB. `order.direction`: front/back/forward/backward. `path.boolean.operation`: unite/subtract/intersect. `point.move` recibe segment, point, x, y; los índices corresponden a segmentos absolutos M/L/C/Z del motor, que convierte arcos y cuadráticas en cúbicas. Las subdivisiones cúbicas usan de Casteljau.

Ejemplo de hueso en posición global de reposo:

```json
{"type":"bone.add","bone":{"id":"upper","name":"Brazo","rest":{"x":100,"y":100,"length":100,"angle":0},"rotation":0,"x":0,"y":0,"minRotation":-90,"maxRotation":90}}
```

`bone.ik`: `{type,tip,target:{x,y},flip?}`. `skin.bind`: `{type,ids,bones}`. `skin.weight`: `{type,id,index,bone,weight}`; index recorre anclas y manejadores en orden. `mesh.add`: filas/columnas de 2–8. `mesh.move`: id del trazo, índice del control, x/y. Para animar un control: target `PATH_ID::INDEX`, property meshX/meshY. Para morph, property d y trazados con topología idéntica.

## Servicio local

Los endpoints equivalen al CLI: GET `/api/state`, `/api/objects`, `/api/object?id=…`, `/api/history`, `/api/assets`, `/api/svg`; GET `/api/download?file=…` devuelve una exportación guardada; POST `/api/apply`, `/api/undo`, `/api/redo`, `/api/open`, `/api/import`, `/api/export`, `/api/render`. El CLI obtiene URL y token de `.cache/session.json` (modo 0600); no imprimas ni compartas ese archivo. POST exige `x-mai-token`; HTTP y WebSocket verifican host y origen. WebSocket `/events` emite solo operaciones confirmadas.

Flujo del agente: **inspeccionar → modificar con revisión → exportar/renderizar → comparar → validar**. Guarda operaciones y evidencia; deshaz una transacción si no cumple. Exportación admite `--tolerance` (predeterminado .25) y `--max-bytes` (máximo 32 MiB). La cota es una medición adaptativa en puntos de comprobación, no una prueba matemática de error continuo.

Cada exportación de sesión se guarda también como un archivo único en `exports/`, con revisión, perfil y reporte de métricas. Los originales no se sobrescriben.

## Operaciones de composición y agentes
`mai capabilities`, `mai quality --intent fidelity|edit|motion`, `mai audit [FILE.svg]`, `mai insert FILE.svg --expected-revision N [--name NAME --x X --y Y --width W --height H]`, `mai apply ops.json --expected-revision N --dry-run`.

API POST /api/preview ensaya sobre copia; POST /api/insert compila un proyecto importado a SMIL y añade un componente. Importación con append:true conserva la escena. Todas exigen expectedRevision; los POST también token local.

- scene.insert: svg standalone, name, id opcional, x/y/width/height. Namespace de IDs. CSS se aísla por componente; metadatos MAI deben compilarse antes.
- canvas: width,height (1–4096), viewBox origen 0,0.
- motion.preset: id,kind float|spin|pulse|fade,amplitude opcional; duración actual, rechaza pistas ocupadas.
- track.copy: target,to,property,offset opcional en segundos; rechaza destino ocupado.
- track.edit: target,property,action shift|stretch|reverse|delete,amount para shift/stretch. Stretch desde primer keyframe. Cambios fuera de duración revierten toda transacción.

Ejemplo examples/agent-motion.json. La interfaz ofrece Agregar SVG / imagen y cuatro recetas desde el inspector.

## Evidencia automática
`mai proof FILE.svg --times 0,2.5,5 --output NEW_DIR` exporta SVG standalone, renders PNG en Chromium, auditoría y una galería HTML. `mai compare BEFORE.svg AFTER.svg --times 0,2.5,5 --output NEW_DIR` añade error RGBA premultiplicado por tiempo; exige viewport igual. Máximo 20 tiempos, salida nueva (no sobrescribe artefactos). La diferencia de píxeles orienta, no aprueba.

`mai context` carga decisiones, capacidades y revisión actual sin exponer el token. `track.edit reverse` rechaza pistas step; invertir una discontinuidad requiere keyframes explícitos.

Personajes: [CHARACTERS.md](CHARACTERS.md) describe emotion.define/apply/keyframe, sprite.define/state/keyframe, load, spritesheet y preview.

## Preservación y separación asistida
Ver PRESERVATION.md: segment, separate, identity-check, vectorize --identity-profile y operaciones identity.protect/release. El gate de facciones informa fallo con exit 2; las regiones requieren revisión visual.


Fluid.add, fluid --live y choices propose/show/choose/dismiss están documentados con ejemplos y límites en FLUIDS-AND-CHOICES.md. Gradientes ahora admiten axis (vertical/horizontal) y startOpacity/endOpacity 0–1.

## Superficie para agentes (CLI · API · MCP) — 2026-10-04

Un solo registro (`packages/agent/registry.ts`, esquemas JSON 2020-12 validados con Ajv) genera los tres transportes; todos llaman al mismo `AgentService` dentro de la sesión viva, así que comparten revisiones, journal, undo y WebSocket.

- **CLI:** `npm run --silent mai -- <verbo>` (el `--silent` evita el banner de npm en stdout). Salida: exactamente un objeto JSON. Exit 0 éxito · 1 error/validación · 2 conflicto que exige reinspección. `mai tools` lista verbos; `mai call TOOL --flags…` es la forma genérica. Flags derivados del esquema: `--expected-revision 12`, `--take eyes=C`, `--params sadness@eyes=0.5`, objetos como JSON o `archivo.json` (`mai execute --plan plan.json`). Consultas de archivo sin sesión: `--file escena.svg` (inspect, semantics, timeline, identity, audit, critique, performance, export capabilities, resolve, preview, identity check).
- **API:** `POST /api/agent/call {tool, args}` (token local), `GET /api/agent/capabilities`. Errores: `{ok:false, error:{code, message, path?, candidates?, suggestions?, recovery?}}` con HTTP 400/404/409/422/500/503 según `docs/AGENT-CONTRACT.md`.
- **MCP:** `npm run --silent mcp` o `.mcp.json` del proyecto (Claude Code). Codex: `codex exec -c 'mcp_servers.mai_svg.command="node"' -c 'mcp_servers.mai_svg.args=["<ruta>/node_modules/tsx/dist/cli.mjs","<ruta>/packages/cli/main.ts","mcp"]'`. `MAI_ROOT` elige el workspace (su `.cache` contiene la sesión) y `MAI_PORT` el puerto si el servidor MCP debe arrancar el editor. SDK oficial 1.32.0; herramientas con `inputSchema`, `outputSchema`, anotaciones (`destructiveHint` en release/undo/dismiss/ops), disponibilidad `stable|experimental`; las previews vuelven también como imágenes (máx. 4, ≤1,5 MB cada una).

Verbos principales: `inspect`, `semantics`, `selection`, `timeline`, `identity`, `history`, `choices inspect`, `resolve`, `part candidates|label|extract`, `expression propose|rig|apply`, `variant combine`, `choices choose|dismiss|regenerate|note`, `identity preserve|release|mode|check`, `baseline capture`, `animate adjust`, `fluid animate`, `motion spring|preset`, `morph`, `timeline set`, `execute` (plan atómico), `execution` (recibo), `undo --token`, `preview`, `compare`, `critique`, `audit`, `profile`, `export`, `export capabilities`, `inbox`. Lista completa con efectos y ejemplos: `mai capabilities`.

**Plan atómico (`mai execute`)**: `mai.agent-plan/v1` (`packages/agent/schemas/agent-plan.v1.schema.json`) con `constraints.preserve` (capturadas antes de compilar), comandos `variant.apply`, `identity.preserve`, `animation.adjust`, gates `structural|identity|perceptual`, `mode: dry-run|commit` y `requestId` idempotente. Un commit = una transacción del journal con escena, aceptación del tablero y recibo; `transaction.undoToken` (opaco) deshace todo. Si el humano cambia de opinión sobre un tablero ya elegido, `variant.apply` lleva `rechoose:true` (la nueva aceptación reemplaza la anterior; undo vuelve a ella). Una parte preservada que solo es región del arte compartido se evalúa por píxeles de esa región. Ver `docs/AGENT-CONTRACT.md`.
