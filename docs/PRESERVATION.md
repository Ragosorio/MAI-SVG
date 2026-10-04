# Preservar facciones y preparar partes

La geometría original es la referencia de identidad. Vectorizar no recupera automáticamente anatomía, partes ocultas ni expresiones. La separación y las métricas ayudan a preparar y revisar; no prueban identidad semántica ni calidad profesional.

## Herramientas disponibles

```sh
npm run mai -- segment image.png --regions hints.json --output regions.json
npm run mai -- separate character.svg --regions regions.json --output prepared.svg
npm run mai -- identity-check animated-editable.svg --reference approved.png --profile features.json --times 0,1.6,5.2 --output experiments/identity
npm run mai -- vectorize image.webp --identity-profile features.json --output experiments/conversion
```

Segment admite PNG/WebP/JPG mediante Sharp, orientación EXIF y límites de píxeles. Usa OpenCV GrabCut y extracción de contornos en el Python local. Dependencias reproducibles: scripts/requirements-segmentation.txt (versiones verificadas en este equipo). El proceso tiene timeout y límites de regiones/puntos; devuelve JSON, nunca ejecuta instrucciones de una entrada.

Hints: `{ "regions": [{ "id": "head", "name": "Cabeza", "x": 195, "y": 0, "width": 280, "height": 270, "mode": "grabcut" }] }`. Hasta 16 rectángulos en coordenadas de la imagen orientada. Mode rectangle conserva el rectángulo completo. Los resultados necesitan revisión: GrabCut usa diferencias de color, no nombres anatómicos.

Separate requiere SVG estático sin metadata/animación de autoría y regiones con width/height coincidentes con viewBox y `d` de los contornos. Mantiene una fuente geométrica compartida, referencias use locales y máscaras vectoriales. La última región posee los solapamientos. Los recortes admiten poses rígidas; deformar requiere reconstrucción anatómica y de alfa. No descubre regiones ocultas. No sobreescribe el original.

## Protección en motor y editor

Operaciones: `{ "type":"identity.protect", "ids":["eye-left","mouth"] }` y `identity.release` con ids. Se guarda en el SVG editable. La protección rechaza modificaciones geométricas, color, borrado, rig/malla y escala de rasgos protegidos o ancestros. Permite posición/rotación rígidas y operaciones sobre objetos independientes. El inspector ofrece Proteger facciones/Liberar protección.

Protección estructural no detecta todas las oclusiones por máscaras/objetos superpuestos ni equivale a reconocimiento facial. Usar también la comparación ROI. Una referencia use puede derivar apariencia de otra fuente: proteger la fuente y las regiones referenciadas. Proteger no repara pistas existentes: hacerlo antes de animar y evaluar documentos importados con identity-check.

## Comparación por rasgo

Perfil: `{ "width":700,"height":700,"canonicalize":["character","head"],"regions":[{"name":"nariz","x":324,"y":204,"width":29,"height":18,"maxMae":1.5}] }`. Hasta 32 ROI y 24 tiempos. Reference es PNG/WebP/JPG con las dimensiones del perfil; generar la referencia desde el SVG aprobado si se mide la pérdida causada por animación, y desde el raster si se mide conversión. Canonicalize neutraliza posición/rotación de partes declaradas, conservando escala para no ocultar deformación.

Métrica: diferencia RGBA premultiplicada por región, escala 0–255. Guarda renders e identity.json; exit 2 indica fallo. Son comparaciones de píxeles, no una garantía de identidad. Anotar expresiones/oclusiones permitidas en una evaluación visual separada. No eliminar una ROI invariante o subir presupuestos solo para aprobar un fallo.

Vectorize --identity-profile compara el candidato con original.png orientado; --identity-reference permite una referencia explícita. Se conserva el candidato fallido para diagnóstico, se registra identity-review-failed y el comando termina con error. El gate no modifica ni reemplaza el preset elegido.

## Investigación y límites

Se integró [GrabCut de OpenCV](https://docs.opencv.org/4.13.0/d8/d83/tutorial_py_grabcut.html) para segmentación asistida; [Paper.js](https://paperjs.org/reference/path/) ya opera curvas/booleanas en MAI. La separación reutiliza [máscaras y recortes SVG](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/clipPath), conservando geometría y alfa. [VTracer](https://github.com/visioncortex/vtracer/releases) sigue siendo el conversor fijado a 1.0.0-alpha.4; sus alternativas de segmentación no demuestran anatomía automática y no se cambió el preset aprobado.

La licencia de OpenCV moderno es Apache-2.0; se usa como dependencia del entorno y no se copió código del tutorial. Sharp/Paper/VTracer continúan documentados en DEPENDENCIES.md. El empaquetado distribuible debe incluir o instalar las dependencias Python declaradas.

## Mejorar sin perder el personaje

El usuario autoriza mejorar skills y animaciones del proyecto. Capturar el fallo real, preservar la referencia, corregir, añadir regresión, renderizar expresiones y actualizar instrucciones. Las cuatro skills nuevas viven en .agents/skills: mai-preserve-identity, mai-separate-parts, mai-game-delivery y mai-refine-animation. No afirmar que el producto es el mejor editor existente: medir fidelidad, utilidad, rendimiento y compatibilidad de cada entrega.
