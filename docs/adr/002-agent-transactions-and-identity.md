# ADR-002: planes atómicos, snapshots e identidad con referencia explícita

**Estado:** Propuesto. Las garantías de reversibilidad, preservación y elección humana vienen del usuario.
**Fecha:** 2026-10-04.
**Responsables:** implementador del servicio y revisor de identidad/animación.

## Contexto

Un mensaje puede pedir una mezcla de variante, conservación de boca y cambio de ritmo del humo. Hoy cada verbo puede confirmar por separado. Las imágenes, el historial, el tablero y la revisión retornada no siempre quedan ligados a la misma transacción. Los guards inspeccionan tipos de operación, pero efectos indirectos pueden eludirlos.

## Decisión

### Unidad de consistencia

Identificar una sesión con `sessionId`, un documento con `documentId` persistente y una revisión monotónica de sesión con `revision`. Abrir otro asset cambia `documentId` y avanza la revisión; undo del open restaura la identidad anterior. No usar el nombre del archivo como identidad.

Un snapshot inmutable incluye esos IDs, revisión, hash de contenido y versión de modelo. Paths semánticos son alias útiles; las mutaciones usan `partId` estable dentro de `documentId`, con un scope de personaje para referencias colectivas.

Tableros y comentarios tienen versión propia porque pueden cambiar sin editar el SVG. Una opción lleva `boardId`, `boardVersion`, `optionId`, `snapshotId`, spec y hash del candidato. Nunca resolver «primera» con un tablero diferente del que vio el humano.

### Ejecución del plan

1. Validar schema, sesión/documento, revisión y versiones de tablero. Resolver todas las referencias sobre un snapshot; exigir scope para ambiguas.
2. Capturar las restricciones de identidad **antes** de evaluar comandos, independientemente de su posición en el JSON.
3. Compilar comandos ordenados sobre un draft; producir `Operation[]`, read/write sets, costes, features requeridas e impactos resueltos. No confirmar cada verbo.
4. Validar estructura, límites y todos los efectos transitivos sobre las regiones protegidas. La ejecución en draft usa los mismos evaluadores que preview/export.
5. Preparar previews y checks obligatorios sobre ese draft, fuera de la cola de escritura. El trabajo costoso no bloquea ediciones humanas.
6. En `dry-run`, devolver reporte y artefactos. No cambia revisión, elección, política persistente ni journal. Los temporales son efectos declarados; no se promete cero filesystem.
7. En `commit`, entrar a la cola, volver a comprobar revisión y versiones, y publicar el draft validado como **una** transacción. Conflicto: descartar commit, conservar evidencia marcada obsoleta; no reintentar sobre otra revisión.
8. Persistir documento, cambios de decisión/protección y recibo en un evento durable; publicar WS solo después. Materializar vistas de tablero/inbox desde ese evento para recuperación idempotente.
9. Devolver revisión confirmada y snapshot del recibo, nunca la revisión que casualmente exista al terminar un render.

Mantener los límites actuales del core (500 operaciones básicas, tamaño de SVG y complejidad). Un comando que expande a demasiadas operaciones devuelve `BUDGET_EXCEEDED`; no trocear silenciosamente un plan atómico. La semántica reduce operaciones manipulando grupos y parámetros, no enviando un comando por cada path.

### Fallos, jobs y reintentos

- Error de compilación, render/gate requerido o persistencia antes del commit: cero cambio visible y `committed:false`.
- Si fallan tareas opcionales después del commit, devolver `committed:true`, recibo y warnings/artefactos fallidos. Nunca responder como si nada se hubiera aplicado.
- `requestId` es una clave de idempotencia local. Registrar hash de payload y recibo en el journal; misma clave/mismo plan retorna el mismo resultado, misma clave/otro plan se rechaza. Es necesario para `scale:0.7` ante reintentos.
- Un job costoso tiene `jobId`, snapshot, estado (`queued/running/succeeded/failed/cancelled`), progreso y errores. Cancelación antes de commit no muta; después informa la transacción confirmada. El límite de retención se documenta; fuera de él se devuelve desconocido, no se ejecuta a ciegas.
- Un `undoToken` opaco identifica documento y transacción. Solo deshace si sigue siendo la última transacción deshacible de ese documento; una edición humana intermedia exige reinspección. No usar únicamente `rev:N` entre documentos/sesiones.

No implementar CRDT ni colaboración distribuida ahora: una cola local con control optimista es suficiente. Preparar sobre snapshot y hacer CAS al commit evita mantener esa cola durante renders.

### Contrato de identidad

La protección es un conjunto de restricciones, no una etiqueta estética:

| Política | Invariante mínimo |
|---|---|
| `locked` | Conserva resultado evaluado, transformaciones y estilo dentro del scope especificado |
| `protected` | Geometría/estilo propios constantes; permite solo movimiento rígido declarado |
| `deformable` | Permite deformación acotada respecto a landmarks/baseline; conserva color y topología |
| `style-preserved` | Conserva paint, gradientes, stroke, opacity y referencias de estilo resueltas |
| `topology-preserved` | Mantiene subpaths, conectividad y correspondencias declaradas |
| `color-preserved` | Conserva pintura efectiva, incluyendo herencia, drivers y gradientes compartidos |
| `silhouette-preserved` | IoU de máscaras renderizadas contra referencia, a tiempos definidos |
| `free` | No agrega restricciones; no anula restricciones heredadas o solapadas |

Combinar restricciones por intersección de permisos. `free` no gana sobre `protected`. Para cambiar una política existe operación explícita y auditada; una variante no puede liberarla incidentalmente.

La identidad debe seguir la geometría por dependencias: ancestros, `<use>`/master, máscaras, clipPaths, gradientes compartidos, drivers, capas, morph, rigs y modificadores. Compilar un `ImpactSet` resuelto y validar también el estado evaluado. Un switch incompleto de tipos de operación no es una garantía suficiente.

Las agrupaciones semánticas padre incluyen restricciones de sus descendientes aunque el padre no tenga targets SVG. Merge/split/relabelling deben transferir la unión de restricciones; no perder protección al cambiar la taxonomía.

### Qué significa «conservar como está»

La referencia predeterminada es el snapshot observado por el agente. Conservar una boca deja sus canales locales de geometría, pintura y expresión tal como se evaluaban a los tiempos requeridos; puede seguir el movimiento rígido de la cabeza. No poner automáticamente expresión a cero, congelar toda animación o sustituirla por la geometría neutral.

La vuelta al original aprobado es una intención distinta: usa `baselineId`. La boca de una opción concreta usa su opción/snapshot. La superficie expone estas referencias al agente; el motor no deduce la referencia desde palabras.

Una regla temporal de plan (`constraints.preserve`) impide cambios en esa transacción. `identity.preserve` agrega además política persistente para ediciones futuras y debe capturar explícitamente la referencia. Ambas se comprueban contra el estado anterior; su posición entre los comandos no permite preservar después de haber destruido el rasgo.

### Baselines y validación

Registrar baseline inmutable con asset/documento, hash del original, hash de geometría/paint por región, landmarks, coordenadas, procedencia y estado de aprobación. Un baseline creado automáticamente no queda `human-approved`. Guardar referencia mínima en metadatos; imágenes grandes de evidencia pueden ser sidecars con hashes.

Separar dos comprobaciones:

- **Regresión de identidad:** comparar resultado con baseline o snapshot histórico independiente.
- **Desplazamiento de expresión:** medir deformación respecto al reposo del rig, que puede ser el de la escena actual.

Cada resultado lleva `pass`, `fail` o `not_evaluated`, referencias, tiempos solicitados/evaluados, regiones encontradas/omitidas, métrica, umbral y motivo. Baseline ausente, arrays vacíos, parte inexistente o renderer indisponible no producen `pass`. Un gate requerido con `not_evaluated` detiene el commit.

Umbrales estrictos/equilibrados/libres son parámetros calibrados con fixtures, no verdad universal sobre parecido. Los porcentajes actuales de landmarks (8/20/45 %) son heurísticas del prototipo; no elevarlos a garantías artísticas ni sustituir IoU con área de bounding boxes. Alineación rígida explícita y limitada; no alinear deformaciones para ocultarlas.

Un check por timestamps demuestra esos timestamps, no una cota continua. Muestreo de extremos/adaptativo debe informar su cobertura y presupuesto. No presentar siete renders de Candy como prueba matemática de cada instante de la animación.

### Expresiones, variantes y tiempo

`variant.combine` crea un candidato; no acepta implícitamente. `variant.apply` dentro de un plan confirma una composición indicada por el usuario, usando el mismo combinador puro. La elección puede venir de un click o de la instrucción humana ya recibida; no se exige un segundo click si la autorización es clara. Registrar evidencia de procedencia, sin fingir que un texto enviado por un agente prueba por sí solo una aprobación humana.

La combinación trabaja con canales declarados de slots ligados a `partId`; no inferir propiedad de boca solo por un sufijo en un nombre de parámetro. Parámetros globales que afectan a una boca preservada deben descomponerse por scope o rechazarse como `NOT_COMBINABLE`. Slots pedidos que la fuente no define se rechazan; no conservar silenciosamente los de otra opción.

En el primer corte solo se ajusta un origen de animación resuelto (`sourceId`). Velocidad ×0.7 significa tiempo local ×0.7, duración de ciclo ÷0.7. Para pistas finitas que exceden duración: `onOverflow:reject` por defecto, o extensión explícita compatible con toda la escena. Los modificadores periódicos necesitan política de loop explícita; no forzar cierre retocando el factor solicitado.

La composición futura de capas parte siempre del reposo: pose, expresión/visemes/blink, deformaciones compatibles, secondary y efectos con orden declarado. Los modos additive/override necesitan identidad neutral, propiedad y espacio de coordenadas; no sumar strings de paths o colores. Conflictos entre skin/morph/warp se rechazan hasta disponer de una composición probada. El evaluador usado para scrubbing debe producir el mismo frame independientemente del historial de reproducción.

## Alternativas y consecuencias

| Alternativa | Ventaja | Motivo para descartarla |
|---|---|---|
| Secuencia de llamadas con undo compensatorio | Reutiliza handlers directamente | Puede fallar rollback o deshacer cambios humanos intercalados |
| Bloquear la sesión mientras se renderiza | Consistencia sencilla | Inutiliza el editor con Candy y tareas largas |
| Snapshot + compilación + CAS **elegida** | Una revisión, preview verificable y UI libre | Requiere recibos, invalidación y persistencia coordinada |

La implementación se considera cerrada cuando pasan rollback, concurrencia, recuperación, identidad indirecta y el recorrido externo definido en [CONTINUATION.md](../CONTINUATION.md). Esta revisión diseña esas garantías; no declara que ya existan.
