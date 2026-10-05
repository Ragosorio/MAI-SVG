# Investigación de Agent Surface — 2026-10-04

Alcance acotado: fronteras agente/core, router y protocolo MCP. Las decisiones de MAI son implementación propia. No se copiaron fuentes ni se añadieron dependencias.

| Fuente primaria consultada | Hecho observado | Aplicación propuesta a MAI |
|---|---|---|
| [Impeccable: fuente de la skill](https://github.com/pbakaus/impeccable/blob/main/skill/SKILL.src.md) | Contexto inicial y referencias seleccionadas por intención; separa audit/critique | Router corto y playbooks especializados; distinguir prueba técnica de juicio artístico |
| [Impeccable: providers.js](https://github.com/pbakaus/impeccable/blob/main/scripts/lib/transformers/providers.js) | Configuración por proveedor transforma frontmatter, rutas y artefactos | Si se necesitan adaptaciones, generarlas desde una fuente; no mantener prompts divergentes |
| [Impeccable: DEVELOP.md](https://github.com/pbakaus/impeccable/blob/main/docs/DEVELOP.md) | Fuente en skill/, build por proveedor y pruebas de comportamiento basadas en trazas | Probar que un agente llama las herramientas correctas, además de validar Markdown |
| [MCP tools, revisión 2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18/server/tools) | Tools tienen schema de entrada y pueden declarar salida; structuredContent acompaña resultados; distingue errores de protocolo/dominio | Catálogo común y paridad de transportes; salida tipada e imágenes vinculadas a snapshot |
| [MCP lifecycle, revisión 2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle) | Inicialización, negociación, operación y cierre son fases explícitas | Probar lifecycle y EOF/cancelación, no solo responder tools/list |
| [SDK oficial TypeScript](https://github.com/modelcontextprotocol/typescript-sdk) | SDK con documentación y ramas/generaciones; licencia indicada en el repositorio | Fijar versión estable/licencia al implementar; no asumir un nombre o versión de instalación por memoria |

Se consultó la revisión MCP que anuncia el prototipo local; no se afirma que sea la revisión más reciente ni se certificó compatibilidad con versiones adicionales. `main` de los repositorios puede cambiar; estas observaciones son de la fecha indicada.

## Decisiones propias, no conclusiones prestadas

- La fuente canónica de MAI continúa en el repo y el runtime sigue local.
- JSON Schema describe el contrato público, no lenguaje artístico.
- CLI, MCP y API son adaptadores hermanos de un servicio de aplicación.
- `SceneView`, `AgentPlan` y `ProjectDocument` tienen funciones distintas.
- Snapshot + CAS + journal coordinado permite previews largos sin bloquear el editor.
- Identidad requiere referencia independiente, efectos transitivos y cobertura explícita.
- Disponibilidad declarada debe corresponder a evidencia; un preset o tool registrado no demuestra una capacidad terminada.

## Qué no se adopta

No se importan reglas de diseño web, políticas de hooks, permisos o instrucciones de otros agentes. No se instala Impeccable en MAI ni se implementa un motor de lenguaje. MCP no agrega un LLM al core. Elegir SDK no evita probar la semántica de las herramientas.

La revisión técnica de licencias y dependencias se repite sobre versiones exactas antes de incorporar código. Los enlaces no constituyen permiso para copiar implementaciones propietarias.
