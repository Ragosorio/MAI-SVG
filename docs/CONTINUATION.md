# Continuación de MAI SVG para Sol

Estado de partida: 2026-10-04, después de la revisión Astra. **Este es trabajo por ejecutar.** No se considera hecho por aparecer en el catálogo, en tipos o en este documento.

**Avance (2026-10-04, Sol):** S0, S1, S2 y S3 pasan sus gates; S4 es parcial (tres corridas externas con Codex, conflicto nariz/boca pendiente de decisión humana, sin aprobación artística ni tiempos con muestras). Detalle exacto en [STATUS.md](STATUS.md). S5 no se empezó.

## Instrucción lista para retomar

> Continúa MAI SVG desde el checkout local actual; contiene trabajo sin commit de la sesión anterior. Lee AGENTS.md, docs/STATUS.md, docs/AGENT-FOUNDATION.md, los ADR 001/002 y docs/AGENT-CONTRACT.md. Conserva el conversor, high-color-preserved, alfa e identidad; no modifiques No one ni la sesión artística del usuario para hacer pruebas. Implementa primero S0 y S1 de este plan, usando fixtures y sesiones aisladas. Reproduce los probes, conviértelos en regresiones, corrige la superficie existente y crea el ejecutor de planes atómicos sobre VectorDocument. No amplíes feedback.ts ni instales otra arquitectura. Mantén CLI antiguo, API, MCP y editor sobre el mismo servicio. Continúa después con S2–S4, demostrando el recorrido externo de Candy. Informa exactamente qué gates pasaron y cuáles faltan; no marques las 44 áreas completas por tener stubs. Las decisiones técnicas rutinarias están dentro del trabajo; no vuelvas a pedir permiso para cada paso reversible.

No se creó ni se envió otro chat, ni se cambió el modelo. La asignación siguiente describe responsabilidades para cuando se ejecute cada fase.

## Secuencia

| Paso | Resultado | Dependencia | Responsable sugerido |
|---|---|---|---|
| S0 | Guards, referencias y compatibilidad mínima corregidos | Diagnóstico actual | Sol |
| S1 | Plan IR, compilación y commit atómico | S0 | Sol; revisión de frontera por Astra |
| S2 | Tableros/versiones, comentarios y preview live coherentes | S1 | Sol |
| S3 | CLI/API/MCP con contratos equivalentes | S1, se integra con S2 | Sol |
| S4 | Prueba desde agente externo y Candy | S2 + S3 | Agente distinto del implementador |
| S5 | Sistemas sucesivos del roadmap | S4 | Sol; tareas acotadas después para Luna |

La recomendación de modelos no autoriza lanzar automáticamente todos los agentes. Delegar tareas concretas cuando el usuario lo solicite o las instrucciones aplicables lo permitan. No reservar archivos del implementador para workers antes de estabilizar contratos.

## S0 — Cerrar fallos antes de extender

Archivos de partida: `packages/core/identity-guard.ts`, `semantic.ts`, `direct.ts`, `packages/agent/{address,service,registry}.ts`, `packages/cli/{main,agent}.ts`.

- Convertir F01 en test que **exige rechazo y rollback** del driver indirecto, además de attributes directo. Añadir tabla de efectos para parámetros, drivers, modifier.update, rig, tracks, ancestros, paint compartido y `<use>`.
- `eyes` con dos personajes debe producir candidatos; `candy.eyes` resuelve solo ese owner. No mutar partes propuestas sin confirmar su alcance.
- `identity.check` requiere cobertura real y referencia explícita; vacío/renderer ausente/reference inexistente no aprueba. No usar clones actuales como prueba de fidelidad al original.
- Rutas del CLI: capabilities, inspect archivo/sesión, export capabilities, call con --json, history, choices show/inspect/choose, preview archivo/sesión. Comprobar JSON único, códigos de salida, spaces y revisión.
- Resolver la diferencia 180/360: conservar dimensiones lógicas en la API y declarar `scale`/dimensiones raster explícitos, o mantener default anterior. No actualizar el assert a 360 sin definir el contrato ni inspeccionar la imagen.
- Dependencias de compatibilidad/segmentación: diagnosticar entorno exacto de Python/Playwright; registrar requisitos reproducibles. No silenciar tests ni contabilizar skipped como passed.

**Gate S0:** los probes de defecto pasan como regresiones corregidas; suite anterior sin regresiones nuevas. Tests de entorno pendientes permanecen identificados hasta ejecutarlos en un runtime con esas dependencias.

## S1 — Agent IR y transacciones

- Extraer de handlers compiladores puros: reciben snapshot + comando y devuelven operaciones, read/write sets e impacto. Nunca llaman `ws.apply` desde dentro del compilador.
- Implementar schema versionado, `plan.execute`, `plan.status`, requestId/hash, dry-run y un solo commit del plan. `SceneView` no es el formato de plan.
- Conservar constraints de boca antes de combinar. Si parámetros globales afectan el slot preservado y no puede aislarse, fallar con diagnóstico.
- Hacer CAS de revisión/documento/board antes de publicar. Render/gates requeridos sobre snapshot; resultado ligado a la revisión confirmada.
- Recibo durable con undoToken, operaciones compiladas, hash de entrada y artefactos; recuperar tras reinicio. Misma petición repetida no multiplica otra vez la velocidad.
- Persistir aceptación y política de identidad en el mismo journal o como efectos recuperables de ese commit. No dejar un board elegido con una escena sin aplicar, ni el inverso.
- Modelar costos/cancelación para renders largos; no sostener la cola local mientras se generan previews.

**Gate S1:** fixture A/C + preserve mouth + speed .7 produce un commit. Fallo de último comando, disco, render previo o identity deja cero cambios. Retry, reinicio, conflicto entre dry-run/commit y edición humana durante render tienen resultados inequívocos. Undo restaura escena y estado de decisiones.

## S2 — Integración visible y decisiones

Archivos de partida: `apps/editor/src/App.tsx`, `packages/server/{choices,comments,inbox,server}.ts`.

- Sincronizar selección (documento/revisión/cliente), timecode y contexto de región; comentario guarda snapshot/screenshot y procedencia.
- Mostrar 2–6 candidatos con slots, preview y versión; recomendar no equivale a elegir. Las mezclas generan candidato derivado con procedencia.
- Soportar elección textual ya autorizada por el usuario y click; no añadir una aprobación duplicada obligatoria.
- UI muestra preparación, progreso, preview de draft, commit y fallos posteriores sin confundirlos. Reproducción usa el mismo evaluador de frame que export.
- Reconectar con replay o resync; descartar previews obsoletos y no asociar comentarios por nombre de archivo.

**Gate S2:** prueba browser real de selección → comentario → propuesta → mezcla → commit → WS → repaint → undo. La captura de la revisión visible y los hashes de previews quedan en la evidencia. Un test que observa solo un WebSocket no demuestra que el editor se actualizó.

## S3 — Transportes y router

- Derivar CLI/API/MCP de schemas comunes de entrada/salida. Validador estándar fijado, errores por path y disponibilidad por runtime.
- Corregir/envolver rutas anteriores; cualquier desviación de contrato queda explicitada y probada.
- Integrar SDK MCP oficial fijado, tras revisar licencia/versión, o certificar el adaptador manual bajo estado experimental. Cubrir lifecycle, negociación, mensajes inválidos, idempotencia, cancelación, EOF y límites de imágenes.
- Exponer solo herramientas implementadas; operaciones indisponibles explican prerrequisitos. No imprimir token de `.cache/session.json`.
- Actualizar router y playbooks con comandos **que ya pasaron** pruebas externas. Añadir flujo de mejoras de skills con fixtures y trazas; sin autoedición descontrolada.

**Gate S3:** mismo input estructurado por los tres transportes produce el mismo resultado normalizado, mismo error, impacto y revisión. SDK cliente independiente lista/calla herramientas. CLI antiguo conserva uso de archivo/sesión.

## S4 — Benchmark de Candy y agente independiente

- Copiar fuentes aprobadas a un workspace temporal. Conservar IDs y registrar hashes; preparar semántica usando evidencia visual, sin inventar anatomía oculta.
- Verificar el humo **original**. El ejemplo anterior ocultaba su región estática y añadía efecto procedural: no usarlo como prueba de animate-existing.
- Ejecutar los diez pasos de AGENT-CONTRACT desde CLI/MCP externo. Registrar herramientas, argumentos y recibos sin credenciales. No entregar al agente el plan JSON solución.
- Evaluar siete tiempos existentes, más extremos/loop cuando cambie la duración. Nariz/boca, ojos, alfa y humo reciben evidencia de región además de frame completo.
- Añadir una petición no contenida en tests, fixtures o regex después de fijar el arnés. La prueba mide descubrimiento y composición, no memoria del implementador.
- Separar fidelidad, craft y rendimiento. Medir servicio, IPC/WS y pintura con muestras; no prometer 60 FPS por un ping rápido.
- No modificar los 31 gatos restantes sin revisión individual.

**Gate S4:** agente externo, integración visual y export/reopen demostrados. Registrar límites de navegador/export y elección artística todavía pendiente cuando corresponda.

## Paquetes acotados para Luna después de S1

| Paquete | Entrada cerrada | Salida | Restricción |
|---|---|---|---|
| Contract fixtures | Schemas implementados | Casos válidos/inválidos y roundtrip | No redefinir IR o errores |
| Paridad de transportes | Servicio estable | Tests de envelopes y salida JSON | No duplicar lógica en wrappers |
| Docs de capabilities | Registro probado | Referencia generada + enlaces | No inventar disponibilidad |
| Catálogo de regresiones | Fixtures y baselines | Reporte por asset | No autoaprobar arte ni cambiar umbrales |

Usar archivos separados por paquete y una persona/agente integra. Astra revisa los límites al terminar S1 y cada sistema grande, no sustituye la prueba externa.

## Definición de terminado por sistema

Diseño y fuentes → schema/IR → fixture pequeño → core → CLI/API → editor → tests de error/rollback → frames comparados → SVG real → export/reopen → límites y skill. Un sistema no pasa a `stable` si le falta uno de los pasos aplicables.

No reimplementar cuarenta familias a la vez. El siguiente corte es S0–S4; el roadmap conserva todo lo demás sin perderlo ni fingir que está terminado.
