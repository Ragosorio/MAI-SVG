---
name: mai-svg
description: Editar, componer, animar personajes con emociones y sprites, y revisar documentos de MAI SVG mediante su CLI local, con calidad vectorial y pruebas de reproducción. Usar para trabajos sobre SVG dentro de MAI, no para diseño genérico de páginas web.
---
# MAI SVG
Ejecutar `npm run mai -- context` al iniciar una sesión para cargar decisiones y revisión. Leer solo las referencias pertinentes al trabajo. Descubrir operaciones reales con `npm run mai -- capabilities`; no inventar comandos ni atribuir capacidades al modelo que el motor no implementa.

Elegir referencia por intención:
- Expresiones, actuación y sprites: [personajes](references/characters.md).
- Componer varios personajes: [composición](references/compose.md).
- Crear o reutilizar movimiento: [animación](references/motion.md).
- Revisar, comparar calidad o entregar: [evidencia](references/evidence.md).

Inspeccionar sesión, IDs y revisión. Preparar JSON de operaciones, ensayar con `apply --dry-run`, aplicar sobre la misma revisión y guardar evidencias. Si aparece 409, releer y adaptar a cambios humanos. Ensayo exitoso no reserva la revisión. Deshacer ante un resultado incorrecto; no recuperar a ciegas sobre cambios ajenos.

El candidato elegido es high-color-preserved. No reemplazarlo con una alternativa más ligera sin comparar. Mantener originales. La inspección técnica no es aprobación visual. Los SVG importados pueden conservar movimiento nativo sin recuperar sus pistas o rig; consultar MOTION.md antes de prometer edición de esa animación.

Para conservar facciones usar mai-preserve-identity; para recortes asistidos mai-separate-parts; para reparar actuación mai-refine-animation; para entregar al videojuego mai-game-delivery. El usuario autoriza mejorar skills y animaciones locales con evidencias, preservando originales y high-color-preserved. Ver docs/PRESERVATION.md.


Humo/agua/viento/lava y preguntas con opciones visuales: [fluidos y decisiones](../../../docs/FLUIDS-AND-CHOICES.md). fluid.add genera curvas periódicas editables, no física ni inferencia de anatomía. choices propose muestra 2–4 alternativas sin editar; la elección es una transacción con revisión y undo. Preparar candidatos que permitan cambiar facciones o componentes, explicar qué se conserva y no escoger por el usuario.
