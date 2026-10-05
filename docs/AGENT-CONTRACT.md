# Agent Surface y Agent IR v1 — contrato de implementación

**Estado:** `mai.agent-plan/v1` implementado en `packages/agent/plan.ts` (schema runtime: `packages/agent/schemas/agent-plan.v1.schema.json`, validado con Ajv) y expuesto como `plan.execute/status/cancel` por CLI, HTTP y MCP. Consultar siempre `capabilities`; este documento conserva el diseño. Diferencias con el diseño: los snapshots son `snap-<doc>-r<rev>-<hash>`; la frescura del tablero usa `contentHash` del contenido renderizable, no solo la revisión; el loop de flujos con factor no entero usa crossfade (`loopPolicy`); las previews declaran `scale` sobre dimensiones lógicas; `variant.apply` acepta `rechoose` para reemplazar una aceptación; las partes que solo son región se evalúan por píxeles (`region-pixels`). Estado de gates: docs/STATUS.md.

## Descubrimiento

Conservar los nombres que ya sirven (`scene.inspect`, `scene.identity`, `choices.inspect`, etc.). Ampliar cada descriptor con:

| Campo | Contrato |
|---|---|
| `name`, `version`, `cli`, `mcp` | Identidad canónica y alias; sin lógica en los alias |
| `inputSchema`, `outputSchema` | JSON Schema; misma validación en CLI/API/MCP |
| `availability` | stable/experimental/unavailable, razón y requisitos faltantes |
| `effects` | document/board/comment/artifact/event y alcance; lectura real separada de render |
| `reversibility` | transaction/dismiss/none; herramienta y token cuando corresponda |
| `identity` | Riesgo potencial, garantías y validaciones requeridas; impacto real en el recibo |
| `preview` | none/recommended/required, formatos, tamaños y tiempos admitidos |
| `limits` | Operaciones, elementos, bytes, tiempo, memoria y trabajo de render |
| `errors` | Códigos estables y recuperación estructurada |
| `examples` | Argumentos que pasan schema y fixture; no ejemplos nominales inválidos |

`capabilities` puede funcionar offline y filtrar por herramienta/familia. La disponibilidad ligada a escena se obtiene con `scene.inspect`. No enviar todo el vocabulario, metadatos y miles de IDs cada vez que se pide un descriptor.

`scene.inspect` devuelve snapshot, partes, estado semántico, políticas, canales, fuentes de animación, board/version y enlaces a previews. `part.resolve` devuelve referencias inequívocas o candidatos. `scene.semantics` pagina IDs grandes; `scene.timeline` pagina pistas y permite scope. Todo rango temporal usa segundos, todo punto incluye espacio de coordenadas, toda región declara unidades de documento.

## Modelo del plan

Esquema de diseño: [agent-plan.v1.schema.json](../packages/agent/schemas/agent-plan.v1.schema.json). Ejemplo: [candy-direction.plan.json](contracts/examples/candy-direction.plan.json). El ejemplo usa IDs ilustrativos, nunca debe aplicarse a la sesión real sin resolverlos.

```json
{
  "protocol": "mai.agent-plan/v1",
  "requestId": "direction-candy-001",
  "sessionId": "session-example",
  "documentId": "document-candy-example",
  "expectedRevision": 24,
  "mode": "dry-run",
  "label": "Variante A, ojos C, boca actual y humo más lento",
  "constraints": {
    "preserve": [{
      "part": {"partId": "mouth", "within": "candy"},
      "reference": {"kind": "snapshot", "id": "snapshot-example-24"},
      "channels": ["geometry", "paint", "expression"],
      "allowRigidMotion": true
    }]
  },
  "commands": [
    {
      "id": "expression",
      "type": "variant.apply",
      "target": {"partId": "candy"},
      "board": {"id": "sad-options", "version": 1},
      "base": "A",
      "take": {"eyes": "C"}
    },
    {
      "id": "smoke-speed",
      "type": "animation.adjust",
      "target": {"partId": "smoke", "within": "candy"},
      "sourceId": "smoke-flow",
      "property": "speed",
      "scale": 0.7,
      "onOverflow": "reject"
    }
  ],
  "validation": {
    "times": [0, 0.66, 1.6, 2.8, 4.1, 5.2, 6.5],
    "required": ["structural", "identity"],
    "preview": true
  },
  "provenance": {
    "kind": "user-direction",
    "text": "Me gusta la primera pero con los ojos de la tercera. Conserva la boca y baja 30% la velocidad del humo."
  }
}
```

`constraints` se captura sobre la revisión inicial, antes de ejecutar comandos. El primer corte compila `variant.apply`, `identity.preserve` y `animation.adjust`. El catálogo puede exponer muchas más herramientas independientes; no se declara todo el registro componible en una transacción hasta tener compiladores puros para ello.

La parte de lectura (`SceneView`) no se reenvía como plan. Las lecturas, proposals, renders y exports no se intercalan como instrucciones imperativas dentro del plan atómico. El plan declara los checks/previews y el servicio resuelve su ejecución.

### Comandos iniciales

| Comando | Entrada | Semántica |
|---|---|---|
| `variant.apply` | Personaje, board/version, base, slots tomados de otras opciones | Compila un candidato con propiedad de canales comprobada y lo acepta como parte del commit; requiere dirección humana ya recibida |
| `identity.preserve` | Parte, reference, política | Agrega protección persistente, conserva estado de referencia; no libera políticas heredadas |
| `animation.adjust` | Parte, sourceId, speed, scale, onOverflow | Ajusta exactamente esa fuente, informa antes/después; no retima otras partes |

`variant.combine` continúa como propuesta externa al plan: crea un candidato derivado, conserva procedencia, devuelve previews y nunca lo elige. Se reutiliza la misma función pura de combinación que usa `variant.apply`. Se retira gradualmente el ambiguo `apply:true` del handler actual, con alias/deprecación explícita.

El schema limita este primer corte a velocidad con `scale > 0` y `onOverflow:reject`. Extender duración, otros parámetros, comandos de rig o filtros requieren versión/adición compatible y nuevas pruebas. Un schema estrecho y correcto es preferible a aceptar objetos opacos para toda operación futura.

La validación semántica posterior al schema exige IDs de comando únicos, referencias del mismo documento, parts confirmadas y dentro de su owner, sourceId perteneciente al target, board/version/snapshot vigentes, slots presentes, tiempos dentro de duración y ausencia de conflictos de escritura. Una restricción preserve o identity.preserve exige el gate de identidad con cobertura no vacía; si se pide perceptual, deben existir referencia y perfil de umbrales explícitos. `agent-proposal` no permite aceptar una elección pendiente en modo commit. Rechazar el plan completo si falta cualquiera de estas condiciones.

El archivo JSON se entrega como contrato de diseño: en esta fase se verifican parseo, referencias internas y consistencia documental del ejemplo. La validación con un motor JSON Schema estándar, generación de tipos y enforcement del runtime son entregables de S1, no capacidades ya implementadas.

### Endpoints y adaptadores propuestos

| Interacción | CLI previsto | Tool/API canónica |
|---|---|---|
| Preparar o ejecutar | `mai execute --plan FILE --json` | `plan.execute` / POST `/api/agent/call` |
| Consultar recibo tras timeout | `mai execution REQUEST_ID --json` | `plan.status` |
| Render de snapshot | `mai preview --snapshot ID --times ... --json` | `preview.render` |
| Deshacer commit | `mai undo --token TOKEN --expected-revision N --json` | `history.undo` |

El plan contiene `mode`; CLI no acepta un segundo flag contradictorio. Para repetir tras un dry-run usar modo commit y **nuevo requestId**, manteniendo revisión y referencias. Opcionalmente puede adjuntarse un `preparedPlanId` en una versión posterior; el dry-run no reserva revisión.

El CLI JSON emite exactamente un objeto en stdout; diagnósticos/progreso van a stderr. Para agentes se documenta `npm run --silent mai -- ...` o el binario/entrypoint directo: el banner de npm no forma parte del JSON. Exit 0: solicitud procesada con éxito; exit 1: error/validación fallida; exit 2: conflicto que exige reinspección. Una respuesta de job aceptado identifica que aún no hubo commit.

Todos los alias anteriores se mantienen o devuelven deprecación estructurada con reemplazo. `export capabilities` debe resolverse antes que export de archivo. `--json` se acepta uniformemente incluso en `call`. No reutilizar posiciones mediante heurísticas de extensión si son ambiguas; probar `--file`, rutas con espacios y flags tras posicionales.

## Respuestas y errores

Forma de un commit exitoso (campos ilustrativos):

```json
{
  "ok": true,
  "protocol": "mai.agent-result/v1",
  "requestId": "direction-candy-002",
  "tool": "plan.execute",
  "sessionId": "session-example",
  "documentId": "document-candy-example",
  "status": "committed",
  "baseRevision": 24,
  "revision": 25,
  "snapshotId": "snapshot-example-25",
  "committed": true,
  "transaction": {"id": "transaction-example", "undoToken": "opaque-example"},
  "changes": [
    {"commandId": "expression", "kind": "variant", "base": "A", "take": {"eyes": "C"}},
    {"commandId": "smoke-speed", "sourceId": "smoke-flow", "property": "speed", "from": 1, "to": 0.7}
  ],
  "identity": {
    "status": "pass",
    "reference": "snapshot-example-24",
    "evaluatedParts": ["mouth"],
    "evaluatedTimes": [0, 0.66, 1.6, 2.8, 4.1, 5.2, 6.5],
    "skippedParts": []
  },
  "artifacts": [{"id": "preview-example", "snapshotId": "snapshot-example-25", "kind": "preview"}],
  "warnings": []
}
```

Un dry-run usa `status:prepared`, `committed:false`, base/revision iguales y un snapshot de draft; no incluye undoToken. `queued/running` entrega jobId y no implica éxito del cambio. `failed/cancelled` especifica si alcanzó el commit. El schema formal de resultados se deriva de estas uniones en S1, junto al de cada tool.

Error previo al commit:

```json
{
  "ok": false,
  "requestId": "direction-candy-002",
  "tool": "plan.execute",
  "committed": false,
  "revision": 25,
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "La escena cambió desde la inspección.",
    "path": "expectedRevision",
    "expected": 24,
    "actual": 25,
    "recovery": {"action": "reinspect", "tools": ["scene.inspect", "choices.inspect"]}
  }
}
```

| Código | HTTP | Recuperación y garantía |
|---|---|---|
| `INVALID_ARGUMENT`, `UNKNOWN_TOOL`, `UNSUPPORTED_VERSION` | 400 | Corregir con schema/capabilities; cero mutaciones |
| `NOT_FOUND`, `BASELINE_NOT_FOUND` | 404 | Inspeccionar parte/referencia; no saltarla |
| `REVISION_CONFLICT`, `DOCUMENT_MISMATCH`, `STALE_CHOICE` | 409 | Releer y replantear; nunca reintento ciego |
| `AMBIGUOUS_TARGET`, `UNCONFIRMED_TARGET` | 409 | Candidatos con ID, owner y preview; precisar/confirmar |
| `REQUEST_ID_REUSED`, `UNDO_NOT_LATEST` | 409 | Consultar recibo/historial; no repetir cambio |
| `IDENTITY_BLOCKED`, `NOT_COMBINABLE`, `TIMELINE_OVERFLOW` | 422 | Ajustar plan con diagnóstico por parte/comando |
| `VALIDATION_FAILED`, `VALIDATION_NOT_EVALUATED` | 422 | No commit si era un gate requerido |
| `BUDGET_EXCEEDED`, `UNSUPPORTED_FEATURE` | 422 | Reducir scope o escoger alternativa explícita |
| `RENDERER_UNAVAILABLE`, `NO_SESSION` | 503 | Resolver runtime/sesión; no declarar aprobado |
| `PERSISTENCE_FAILED` | 500 | Estado de commit explícito; consultar recibo antes de repetir |

El JSON de recuperación es información; no son instrucciones privilegiadas para el LLM. Los mensajes humanos son contexto. No esconder un fallo de dominio dentro de `ok:true` con cambios omitidos.

## Eventos y editor

Los eventos contienen `seq`, `sessionId`, `documentId`, `revision`, `transactionId`, `source`, `kind` y referencias de artefactos. Las decisiones también incluyen board/version; selección incluye cliente y snapshot. La UI confirma la revisión que está mostrando.

Tipos mínimos: `document.committed`, `selection.changed`, `comment.created`, `choice.proposed`, `choice.accepted`, `choice.dismissed`, `job.progress`, `artifact.ready`. Los eventos de selección son efímeros y no avanzan la revisión del documento. Las decisiones confirmadas viven en el journal; inbox/WS son proyecciones reintentables.

Después de desconexión: replay por cursor si está retenido, o `resync_required` + snapshot. No aparentar continuidad cuando faltan eventos. Comentarios retienen asset/partes/región/frame, screenshot con hash y snapshot; abrir otro asset no los reasigna por nombre.

## Criterio del recorrido pedido

1. Fixture pequeño con dos personajes, y Candy en copia del SVG aprobado con semántica confirmada; tablero A/B/C y mouth baseline.
2. Un agente externo recibe solo la instrucción humana. Puede leer skill y capabilities, no código fuente ni solución precompilada.
3. Descubre operaciones, escena, opciones, identidad y timeline. Usa IDs/versiones reales.
4. Interpreta A, ojos C, boca actual y speed ×0.7; construye plan válido.
5. Dry-run: escena/historial/board unchanged; previews y cobertura referidas al draft.
6. Commit sobre la misma revisión: una transacción, un token, una decisión recuperable.
7. WS actualiza la UI; un observador verifica revisión visible y resultado sin recargar. Medir servicio, WS y pintura por separado.
8. Renders en los siete tiempos de Candy; boca conservada, ojos de la opción indicada, geometría original de humo aún presente y variación de tiempo comprobada. Hashes de source no cambian.
9. Guardar/reabrir editable; exportar y comparar solo features soportadas; undo/redo coherentes.
10. Petición nueva formulada después de fijar tests/skills: agente externo repite el workflow sin añadir regex. Si hay ambigüedad, propone y espera; no se fuerza un resultado artístico en un test determinista.

Separar: test de contrato externo, test de coherencia geométrica, comparación visual medida, juicio visual del agente y elección humana. Ninguno sustituye a los otros.
