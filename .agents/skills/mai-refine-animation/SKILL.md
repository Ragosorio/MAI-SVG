---
name: mai-refine-animation
description: Reparar actuación y pérdida de facciones en animaciones MAI con referencias visuales y regresiones reproducibles.
---
# mai-refine-animation

El caso Candy anterior deformaba iris y reconstruía boca con parches visibles. Preferir el candidato convertido aprobado, conservar nariz/hocico/ojos y comenzar por poses rígidas. Leer [personajes](../../../docs/CHARACTERS.md) y [preservación](../../../docs/PRESERVATION.md).

Separar preparación anatómica, actuación y exportación. Añadir anticipación, pausas legibles y movimiento retrasado a partes que soporten la acción. Antes de deformar la cara, demostrar que la geometría y las regiones ocultas están preparadas. Una emoción nombrada no prueba actuación profesional; evaluar su lectura sin etiqueta.

Comparar reposo, máxima expresión, transiciones y cierre del loop. Ejecutar identity-check sobre rasgos invariantes y proof sobre todos los estados. Corregir el fallo, agregar una prueba significativa y actualizar esta skill y sus ejemplos si el flujo cambió. El usuario autoriza mejoras locales a las skills y animaciones: continuar dentro de ese alcance, preservando originales, checkpoints y decisiones de calidad.


El usuario permite cambios expresivos conservando facciones principales: no congelar el rostro por defecto ni sustituir el hocico por líneas genéricas. Separar rasgos invariantes (iris, nariz, proporciones) de los cambios intencionales (párpados, cejas, lágrimas, curvas preparadas). Para fluidos y decisiones visuales leer [el flujo](../../../docs/FLUIDS-AND-CHOICES.md). Usar choices propose con candidatos reales y razón, esperar elección; si se edita el documento, regenerar previews contra la nueva revisión.
