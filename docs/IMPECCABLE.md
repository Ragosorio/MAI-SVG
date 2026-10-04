# Investigación y adaptación para MAI SVG — 2026-10-04
Fuentes primarias: [producto](https://impeccable.style/), [repositorio](https://github.com/pbakaus/impeccable), [skill real](https://github.com/pbakaus/impeccable/blob/main/.agents/skills/impeccable/SKILL.md), [licencia Apache-2.0](https://github.com/pbakaus/impeccable/blob/main/LICENSE).

Impeccable usa contexto duradero, una skill que enruta a referencias por intención, comandos de creación/evaluación/refinamiento, detector determinista y comparación visual en vivo. Su skill evita cargar todos los playbooks y distingue auditoría técnica de crítica visual. La web y README pueden variar en cantidad/nombres de comandos; no fijamos un conteo como contrato.

MAI adopta el patrón con implementación propia, sin copiar su código ni instalar hooks o cambiar permisos del agente:

| Patrón | Implementación MAI |
|---|---|
| Contexto del producto | PRODUCT.md, VECTOR.md, MOTION.md |
| Vocabulario compartido | skill mai-svg con playbooks por intención |
| Herramientas reales descubribles | mai capabilities, CLI.md y tipos Operation |
| Evaluación determinista | mai audit: validez, complejidad, tamaño, alfa/rig, CSS, motion nativo, key único, costura de loop |
| Iteración revisable | apply --dry-run, revisión esperada, historial y undo |
| Crear variantes | exportar checkpoint editable, modificar copia, renderizar mismos tiempos y comparar |
| Trabajo en vivo | mismo motor de comandos, journal durable y WebSocket |

No equiparamos nuestras reglas vectoriales a sus 61 reglas de frontend. La crítica del parecido y el ritmo sigue siendo visual. Nuestra documentación original acredita la inspiración; Impeccable no es dependencia del runtime.

La composición admite CSS por parser estructural [CSS Tree](https://github.com/csstree/csstree): namespace de selectores, referencias y keyframes. Se rechazan reglas globales no soportadas en lugar de cambiar otros personajes.
