---
name: mai-refine-animation
description: Reparar actuación y pérdida de facciones en animaciones MAI con referencias visuales y regresiones reproducibles.
---
<!-- Generated from skills-src by scripts/build-skills.ts — edit the source, then run: npm run skills -->
# mai-refine-animation

El caso Candy anterior deformaba iris y reconstruía boca con parches visibles. Preferir el candidato convertido aprobado, conservar nariz/hocico/ojos y comenzar por poses rígidas. Leer [personajes](../../../docs/CHARACTERS.md) y [preservación](../../../docs/PRESERVATION.md).

Separar preparación anatómica, actuación y exportación. Añadir anticipación, pausas legibles y movimiento retrasado a partes que soporten la acción. Antes de deformar la cara, demostrar que la geometría y las regiones ocultas están preparadas. Una emoción nombrada no prueba actuación profesional; evaluar su lectura sin etiqueta.

Ciclo de refinamiento:
1. Mirar `render_filmstrip` / `mai filmstrip` (`sampling:"significant"`, `ghost`) y `render_motion` / `mai motion render` (trail, spacing, graph).
2. Escribir aserciones del brief y comprobarlas con `verify_motion` / `mai motion verify`.
3. Cambiar una sola cosa en un dry-run de motion-plan v2: curvas, overlap con `motion.propagate`, holds o arcos.
4. Comparar con `compare_motion` / `mai compare motion` y registrar el juicio con `record_critique` / `mai critique record`.

Si una excursión expresiva (parpadeo, squash, smear) choca con la protección, proponer al humano un envelope creativo (`semantic.envelope`, canal `bounded` con `transientDeviation`) en vez de liberar la parte. Comparar reposo, máxima expresión, transiciones y cierre del loop. Ejecutar identity-check sobre rasgos invariantes y proof sobre todos los estados. Corregir el fallo, agregar una prueba significativa y actualizar esta skill y sus ejemplos si el flujo cambió. El usuario autoriza mejoras locales a las skills y animaciones: continuar dentro de ese alcance, preservando originales, checkpoints y decisiones de calidad.


El usuario permite cambios expresivos conservando facciones principales: no congelar el rostro por defecto ni sustituir el hocico por líneas genéricas. Separar rasgos invariantes (iris, nariz, proporciones) de los cambios intencionales (párpados, cejas, lágrimas, curvas preparadas). Para fluidos y decisiones visuales leer [el flujo](../../../docs/FLUIDS-AND-CHOICES.md). Usar choices propose con candidatos reales y razón, esperar elección; si se edita el documento, regenerar previews contra la nueva revisión.
