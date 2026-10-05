<!-- Generated from skills-src by scripts/build-skills.ts — edit the source, then run: npm run skills -->
# Componer
`npm run mai -- session attach` obtiene revisión; `objects --filter ...` pagina IDs. Guardar checkpoint editable antes de una composición grande.

`npm run mai -- insert examples/rig-demo-editable.svg --name Segundo-gato --x 350 --y 0 --width 350 --height 350 --expected-revision N`

La inserción añade un viewport SVG con namespace de IDs/referencias y conserva la escena existente. Es reversible. El rig importado se compila a SMIL; no se incorpora al rig de autoría. Se aíslan selectores CSS y nombres de keyframes. @media/@supports y keyframes están admitidos; reglas globales no soportadas se rechazan y requieren preparar estilos inline. No quitar CSS arbitrariamente porque puede perder identidad o movimiento.

Para un lote, construir varias operaciones scene.insert en una transacción con IDs distintos y SVG standalone. Límite 500 operaciones, 32 MiB y 100000 elementos; dos gatos complejos pueden superar el presupuesto. Reducir complejidad comparando variantes, nunca incrustando un raster.

Seleccionar ID del viewport y aplicar pose o motion.preset para animarlo completo. Para editar nodos buscar IDs prefijados del componente. El rig de descendientes requiere sacarlos de viewport/transformaciones con preparación explícita, no enlazarlos directamente.
