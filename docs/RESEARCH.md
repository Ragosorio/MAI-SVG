# Investigación y decisiones

Consultada el 3 de octubre de 2026 (fecha del usuario).

- [VTracer Node](https://github.com/visioncortex/vtracer/blob/master/nodejs/README.md): convertPixels recibe RGBA. La versión npm instalada es 1.0.0-alpha.4; fijada con lockfile. Experimento real confirma que alfa parcial se pierde en el resultado nativo. MAI añade máscara vectorial. `maxColors` después de trazar no soluciona por sí solo la fragmentación; comparar cuantización previa. Los modos cutout dieron peor alfa en algunos candidatos reales: son experimentales, no predeterminados.
- [SVGO](https://github.com/svg/svgo): optimización conservadora. No usar preset-default para documentos editables/animados sin comprobar IDs, geometría y referencias.
- [SVG-Edit](https://github.com/SVG-Edit/svgedit): referencia de editor web y svgcanvas. No integrado en etapa A.
- [Paper.js Path](https://paperjs.org/reference/path/): curvas, simplificación y geometría; evitar roundtrip integral del documento. No instalado todavía.
- [Glaxnimate formatos](https://docs.glaxnimate.org/en/formats.html): import/export de SVG animado SMIL. Referencia para timeline, no instalado.
- [Potrace](https://potrace.sourceforge.net/): bueno para siluetas y B/N; no elegido como motor principal de gatos a color. No instalado.
- [Inkscape tracing](https://inkscape.org/doc/tutorials/tracing/tutorial-tracing.html): herramienta externa para comparación/limpieza asistida. No se ha ejecutado como benchmark en esta entrega.
- [SVG SMIL](https://developer.mozilla.org/en-US/docs/Web/SVG/Guides/SVG_animation_with_SMIL): animación declarativa para exportar transformaciones y puntos. Rig/IK no son interfaces nativas del estándar: conservar autoría en metadatos MAI y hornear movimiento.
- [Impeccable original](https://github.com/pbakaus/impeccable): documentación durable, skills, comandos y verificaciones deterministas. Referencia de organización; no se ha instalado o copiado su código.
- [Electron procesos](https://www.electronjs.org/docs/latest/tutorial/process-model), [Tauri arquitectura](https://v2.tauri.app/concept/architecture/): web local primero; Electron después para Chromium consistente. Empaquetar no mejora la vectorización.
- [Segmentation-guided Layer-wise Image Vectorization with Gradient Fills](https://arxiv.org/abs/2408.15741): vía de investigación para capas y gradientes; no prueba que sus resultados se reproduzcan en estos gatos ni que sean anatómicos.

No se ha ejecutado segmentación IA, reconstrucción semántica, comparación con Illustrator/Vectorizer.ai ni código de papers. No son capacidades del conversor actual.
