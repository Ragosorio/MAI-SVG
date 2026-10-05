<!-- Generated from skills-src by scripts/build-skills.ts — edit the source, then run: npm run skills -->
# Personajes y emociones
Leer docs/CHARACTERS.md para schemas, límites y ejemplo ejecutable. Usar load para conservar rig y bibliotecas; insert las compila y no fusiona autoría.

Antes de definir emoción identificar regiones semánticas: ojos, boca, orejas, cabeza. Un raster vectorizado no trae esa anatomía. Para Candy preparar partes o reconstruir geometría localizada; nunca afirmar que mapear paths al azar equivale a expresiones.

Definir expresiones reutilizables mediante emotion.define. Mantener topología idéntica para morph, registrar pivotes y probar la expresión estática antes del timeline. Si ya hay pistas usar emotion.keyframe. Sprites son variantes visibles exclusivas: declarar IDs distintos y animar estados con sprite.keyframe. Coordinar VFX y etiqueta con el momento de actuación.

Para actuación diseñar anticipación, acción, asentamiento y follow-through. Elegir pausas legibles para emociones, no solo interpolaciones constantes. Referencia concreta: examples/emotions/milo-operations.json. Adaptar timing al personaje; no copiarlo como criterio universal.

Entregar master editable, standalone, preview y atlas cuando se pidan sprites. Renderizar una muestra por emoción y transiciones; verificar exclusividad, morfología y cierre. El LLM puede ejecutar este flujo hoy; profesional es un juicio sobre el resultado visible, no una bandera del API.

Candy ya tiene una preparación reproducible en scripts/candy-character.ts y examples/candy-emotions. Partir siempre del SVG high-color-preserved aprobado; conservar paths y alfa, recortar regiones visibles con clipPath y referencias use locales. No presentar este recorte como reconstrucción anatómica completa. Las zonas descubiertas por un movimiento requieren pelaje o geometría reconstruida y revisión. Probar reposo contra el original y una emoción contra la exportación antes de continuar. Los movimientos pequeños de cabeza/frasco evitan exigir anatomía oculta.
