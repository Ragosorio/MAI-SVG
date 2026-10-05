# MAI SVG: base para continuar la implementación

Fecha: 2026-10-04. Alcance de esta entrega: fase de arquitectura solicitada para Astra. **Diseño para implementar; no certificación de las nuevas capacidades.**

## Punto de partida

El trabajo anterior terminó conectando el CLI al registro de herramientas. El checkout contiene cambios locales posteriores a `dd57785`, incluido código todavía sin seguimiento en `packages/agent/`, `packages/mcp/` y varios módulos de autoría. No empezar desde el commit remoto ni reemplazar estos archivos con una implementación nueva.

La corrección del usuario ya está parcialmente aplicada: `feedback.ts` conserva un parser, pero la búsqueda actual no encuentra consumidores de `interpretFeedback`; comentarios y variantes usan datos estructurados. **La tarea siguiente no es eliminar un parser activo: es cerrar las garantías del servicio que lo sustituyó.**

Leer en este orden:

1. Este diagnóstico y [decisiones de límites](adr/001-agent-boundary.md).
2. [Transacciones e identidad](adr/002-agent-transactions-and-identity.md).
3. [Contrato de la superficie y del Agent IR](AGENT-CONTRACT.md).
4. [Plan de continuación para Sol](CONTINUATION.md).
5. [Cobertura de los 44 requisitos](AGENT-ROADMAP.md).

## Lo que existe y conviene conservar

| Pieza actual | Evidencia en el checkout | Tratamiento |
|---|---|---|
| SVG y metadatos de autoría | `VectorDocument`, `Project`, import/export editable | Conservar la fuente de verdad; migraciones versionadas |
| Transacción de operaciones básicas | `VectorDocument.apply`, cola/journal de `server.ts` | Reutilizar como commit de una transacción compilada |
| CLI y servicio para agentes | 44 entradas en `registry.ts`, `AgentService.call`, `/api/agent/call` | Consolidar, corregir contratos y comprobar rutas |
| MCP | Adaptador stdio escrito a mano, mismas llamadas HTTP | Prototipo; falta contrato y prueba de interoperabilidad |
| Semántica, expresiones, modificadores, secondary, morph | Nuevos módulos locales | Implementaciones preliminares, no capacidades profesionalmente verificadas |
| Decisiones visuales | `Choices`, previews, persistencia y combinación estructurada | Separar versiones del tablero y del documento; vincular aceptación a transacción |
| Comentarios e inbox | Servicio y modelos presentes | Conectar UI y procedencia; no atribuir al usuario texto generado por el agente |
| UI | Único cambio de `App.tsx`: etiqueta para propiedad `param` | Las nuevas APIs no equivalen a nuevos flujos visibles |
| Conversión y colección aprobada | Pipeline existente y catálogo de 32 gatos | Preservar `high-color-preserved`, alfa, IDs y originales |
| Skills | Router `mai-svg` y diez skills anteriores | Mantener operativas; migrar ejemplos solo cuando las rutas estén probadas |

No se encontró un ejecutor de planes de alto nivel `execute`. `buildIR()` resume la escena; `ops.apply` agrupa operaciones básicas. Ninguno proporciona todavía la transacción semántica compuesta que requiere el usuario.

## Hallazgos ordenados por impacto

**F01 — Protección incompleta frente a efectos indirectos.** `identity-guard.ts:categories` protege un cambio directo de `fill`, pero no resuelve el destino de `expression.driver`. Un fixture protegido rechaza el cambio directo y permite el mismo recolor mediante driver + parámetro. `critique` puede detectarlo después: eso no sustituye impedir el commit. Ver `probe.mjs` y `observed.json` en la evidencia.

**F02 — Falta una transacción de intención completa.** Combinar/aplicar variante, preservar boca y reducir velocidad son llamadas diferentes. `t_variant_combine` puede escribir un candidato y luego aplicar en otro paso. Si el último falla, quedan cambios parciales. Hace falta compilar todo sobre un snapshot y confirmar una sola vez.

**F03 — Resultado positivo sin cobertura de identidad.** `identity.check` acepta `times:[]`, `parts:[]` y devuelve `pass:true` con `perceptual:[]`. También usa como referencia un clon de la escena actual sin algunas deformaciones, no necesariamente el original aprobado. Separar comprobación de deformación de comprobación contra baseline inmutable. Cero regiones o tiempos evaluados debe dar `not_evaluated`, nunca aprobado.

**F04 — Referencias colectivas cruzan personajes.** `resolve('eyes')` admite los cuatro ojos de dos personajes porque todos tienen roles del grupo `eyes`. La mutación necesita dueño inequívoco y scope; la ambigüedad debe producir candidatos. Las partes `proposed` tampoco deben adquirir autoridad de `confirmed` solo por resolver su nombre.

**F05 — Contratos CLI que no llegan al servicio correcto.** `export capabilities --json` entra al exportador anterior e intenta abrir un archivo llamado `capabilities`. `call capabilities --json` rechaza el flag; el CLI normal sí lo acepta. `capabilities --json` funciona y anuncia 44 herramientas. Probar toda la tabla de rutas y la compatibilidad anterior, no solo el registro.

**F06 — Revisión y resultado posteriores a un commit.** `commit` confirma con `ws.apply` y después renderiza sobre `this.m()`. Un render puede fallar cuando la escena ya cambió; otra transacción puede adelantar la revisión mientras se renderiza. `call` toma la revisión al terminar. El recibo, la imagen y el resultado deben referirse al mismo snapshot, y distinguir fallo previo de fallo posterior al commit. Observación de código; falta prueba concurrente/fault injection.

**F07 — Escena y tablero no se confirman juntos.** `choice.choose` aplica la escena, luego guarda estado `chosen` e inbox fuera del journal de la escena. Un fallo de disco o una acción concurrente puede dejar registro inconsistente. `undo` restaura SVG, no el estado del tablero. Resolver con eventos recuperables del mismo commit.

**F08 — Schemas insuficientes para descubrimiento fiable.** `returns` es texto, no esquema de salida. La región `{kind:'rect'}` sin coordenadas pasa el validador del registro; se espera rechazo más profundo. `choice.propose.request` y `ops.apply` admiten objetos abiertos. Los esquemas deben describir y validar las mismas uniones que ejecuta el servicio; no crear otro validador parcial.

**F09 — Contratos de identidad ambiguos.** `combineSpecs` elimina valores con sufijo de slot al conservar una parte, pero puede conservar parámetros globales u operaciones en `base`. Su comentario equipara preservar a volver a geometría neutral. `expression.freeze` tampoco define una captura del estado actual. «Conserva la boca como está» requiere una referencia explícita, no restaurar implícitamente su reposo.

**F10 — Scope temporal incompleto.** `animation.adjust` salta una pista si ralentizarla excede duración y puede confirmar los modificadores restantes. La respuesta puede mezclar elementos cambiados y omitidos. La nueva transacción rechaza todo o exige una política de duración explícita; no aplica silenciosamente una fracción.

**F11 — Medición anunciada distinta de la implementada.** La descripción de `silhouette-preserved` promete IoU ≥ 0.9; `critique` calcula variación de áreas de bounding boxes de paths directos. No es IoU ni considera toda geometría descendiente. Anunciar la medida real; el gate de silueta necesita máscara renderizada y baseline.

**F12 — Integración visible pendiente.** No aparecen llamadas de la UI a `/api/selection`, comentarios o notas de choices. La selección que consulta un agente puede permanecer vacía aunque el humano seleccione en pantalla. El flujo visible nuevo requiere selección compartida, comentarios con frame, mezcla de candidatos, recibos y reconexión.

**F13 — MCP y exportación aún no certificados.** El adaptador MCP no mantiene estado de inicialización, no valida el sobre JSON-RPC y marca toda herramienta `destructiveHint:false`, incluida la liberación de protección. La tabla de formatos distingue algunos `planned`, pero no demuestra que cada exportador implemente o rechace toda combinación. Son puntos de revisión y pruebas; no se ejecutó un agente externo ni la matriz de formatos en esta fase.

## Verificación de esta revisión

| Comprobación | Resultado actual |
|---|---|
| `npm run typecheck` | Pasa |
| `npm run build` | Pasa |
| `npm test` | 41 ejecutadas, 37 pasan, 4 fallan |
| Test de choices | PNG de ancho 360; contrato del test espera 180; el código nuevo aplica escala 2 en crops pequeños |
| Dos pruebas de compatibilidad | Fallan al lanzar Firefox ausente; no llegan a completar WebKit |
| Segmentación OpenCV | `ModuleNotFoundError: No module named 'cv2'` en el Python usado por el test |
| Probes nuevos de arquitectura | Reproducen F01/F03/F04/F05/F08 en fixtures y procesos aislados |
| Agente externo + Candy + editor | Pendiente; obligatorio en la fase de implementación |

La primera ejecución de tests quedó bloqueada por el socket local de `tsx` en sandbox; la ejecución autorizada posterior produjo los resultados anteriores. No se instalaron dependencias. Las pruebas existentes actualizan su `session-benchmark.json`; no interpretar ese archivo como benchmark nuevo de Candy.

Evidencia: [baseline](../experiments/architecture-20261004/baseline.json), [salida de tests](../experiments/architecture-20261004/tests.tap), [probes reproducibles](../experiments/architecture-20261004/probe.mjs), [resultados](../experiments/architecture-20261004/observed.json). El manifest adjunto identifica el código revisado; los resultados dejan de describir el checkout cuando cambien esos archivos.

## Orden de decisión

1. Cerrar F01, F03, F04 y F05; son fallos observables y acotados.
2. Introducir snapshot, compilador de Agent IR y recibo atómico sobre el motor existente.
3. Integrar editor y MCP sobre el mismo servicio.
4. Demostrar el flujo humano completo con Candy y una petición inédita.
5. Incorporar cada sistema posterior de forma vertical, según el roadmap.

La revisión fija una dirección implementable. Los ADR están propuestos como contrato técnico de continuación; las restricciones originales del usuario sí son obligatorias. Cambiar un detalle propuesto exige explicar el motivo y mantener los invariantes, no una aprobación adicional para cada decisión rutinaria.

## Estado de los hallazgos tras S0–S4 (2026-10-04, implementación Sol)

| Hallazgo | Estado | Evidencia |
|---|---|---|
| F01 protección indirecta | Corregido: guard previo por categorías (drivers, parámetros, clips, modificadores, ancestros) **y** verificación del estado evaluado (estáticos, referencias `<use>`/defs, instancias, herencia de estilo y fotogramas) antes de confirmar; rollback completo | `tests/agent-surface.test.ts` F01 (2 pruebas) |
| F02 transacción de intención | Corregido: `plan.execute` (`packages/agent/plan.ts`) compila sobre borrador, valida y confirma una sola vez con recibo idempotente | `tests/agent-plan.test.ts` |
| F03 identidad sin cobertura | Corregido: referencia explícita (`snapshot`, `baseline`, `rig-rest`), partes/tiempos obligatorios, `not_evaluated` nunca es `pass` | F03 |
| F04 referencias colectivas | Corregido: dueño por personaje (`AMBIGUOUS_TARGET` con sugerencias `catA.eyes`), partes propuestas no mutables (`UNCONFIRMED_TARGET`) | F04 |
| F05 rutas CLI | Corregido: `export capabilities`, `call … --json`, `--file`, rutas con espacios, un JSON y exit 0/1/2 | F05, `tests/transports.test.ts` |
| F06 revisión post-commit | Corregido en plan: previews/gates sobre el borrador, CAS al confirmar, recibo ligado a la revisión confirmada | S1 (edición humana durante render) |
| F07 escena y tablero | Corregido: `choice.accept` viaja en la misma transacción; el tablero es proyección del journal (undo lo devuelve a `pending`) | S1, S2 |
| F08 schemas | Corregido: Ajv 2020-12 único, regiones como unión cerrada, `choice.propose.request` completo, `ops` discriminadas, ejemplos validados | F08 |
| F09 «conservar como está» | Corregido en plan: `preserve` contra snapshot; parámetros globales se descomponen por slot o se rechaza `NOT_COMBINABLE` | S1 |
| F10 desborde temporal | Corregido: rechazo completo (`TIMELINE_OVERFLOW`) en plan y en `animation.adjust` | S1 |
| F11 silueta | Corregido: `critique` anuncia aproximación por cajas; IoU real de máscara renderizada en `identity.check` | — |
| F12 integración visible | Corregido: selección compartida, comentarios con captura, tablero 2–6 con versión/procedencia/notas, feed de actividad, undo | `tests/editor-flow.test.ts` (Chrome real) |
| F13 MCP/exportación | MCP sobre SDK oficial 1.32.0 con ciclo de vida/EOF/JSON inválido probados; matriz de exportación sigue marcando objetivos `planned` | `tests/transports.test.ts` |
| F14 cambio de opinión sobre un tablero elegido | Corregido: `variant.apply` con `rechoose:true` reemplaza la aceptación en la misma transacción (`supersedes`); undo vuelve a la anterior | S4 corrida 2 → `S4 regression` |
| F15 parte preservada que solo es región | Corregido: gate de identidad de planes por píxeles de región (`region-pixels`), igual que `identity.check` | S4 corrida 2 → `S4 regression` |
| F16 frescura del tablero | Corregido: `contentHash` excluye etiquetas, protecciones y baselines (no cambian fotogramas) | `S4 regression` |
| F17 undo marcado destructivo | Corregido: undo/redo sin `destructiveHint`; un cliente con aprobación «never» las rechazaba | `tests/transports.test.ts` |
| F18 scope de candidatos en parte-región | Corregido: busca en el ancestro con un elemento | S4 corrida 3 → `S4 regression` |
