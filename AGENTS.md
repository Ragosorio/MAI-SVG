# MAI SVG

Proyecto independiente. No modificar `/Users/roor.osorio/Desktop/No one`.

Consultar `docs/STATUS.md` antes de continuar. El usuario seleccionó high-color-preserved el 2026-10-04 y autorizó avanzar al editor. Los otros gatos requieren revisión visual individual. No interpretar las métricas como aprobación estética. No declarar completos rig, timeline o sesiones porque el conversor funcione.

Preferir codebase-memory-mcp para descubrir código; indexar este proyecto si aún no existe en el grafo. Búsquedas de configuraciones, documentación o strings pueden usar rg.

Ejecutar `npm run test` y `npm run typecheck` después de cambios en el conversor. Mantener la alfa vectorial: VTracer nativo pierde alfa parcial. Nunca incrustar una imagen para mejorar artificialmente la fidelidad. Preservar IDs y referencias para edición.

Skills actuales: mai-vectorize, mai-validate, mai-cleanup, mai-rig y mai-animate en `.agents/skills/`. Consultar `docs/CLI.md`; comandos futuros no son funciones disponibles.

Contexto de agentes: PRODUCT.md, VECTOR.md y MOTION.md. La skill mai-svg enruta composición, animación y evidencia. Usar capabilities para descubrir operaciones; apply --dry-run no guarda ni reserva revisión. Audit separa hallazgos técnicos de aprobación visual.

Preservación: docs/PRESERVATION.md, identity.protect/release, segment/separate e identity-check. Nuevas skills en .agents/skills/mai-preserve-identity, mai-separate-parts, mai-refine-animation y mai-game-delivery. Usar docs/GAME-ASSETS.json para rutas de los 32 gatos. El usuario autoriza mejorar skills/animaciones con pruebas del fallo real; no desactivar una comparación para silenciar un fallo.


Fluidos y preguntas al usuario: docs/FLUIDS-AND-CHOICES.md, fluid.add / fluid --live, choices propose/show/choose/dismiss y emotion.update. No elegir automáticamente una alternativa pendiente. Las propuestas pueden variar facciones o componentes con operaciones explícitas, conservando invariantes y referencias. Los fluidos actuales son efectos procedurales vectoriales, no física ni inferencia automática desde píxeles.
