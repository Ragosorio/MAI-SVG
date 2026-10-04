---
name: mai-preserve-identity
description: Preservar facciones al convertir o animar personajes SVG en MAI, detectar pérdidas locales y proteger geometría original.
---
# mai-preserve-identity

Guardar una referencia del PNG y del SVG aprobado. Evaluar ojos, nariz, boca, contorno y accesorios por separado; un error global pequeño puede ocultar la pérdida de un rasgo pequeño. Leer [herramientas](../../../docs/PRESERVATION.md).

Aplicar identity.protect a los IDs que definen la identidad. El motor permite posición/rotación rígidas, pero rechaza geometría, color, borrado y escala de regiones protegidas y sus ancestros. identity.release es una decisión explícita de reconstrucción; conservar antes/después y volver a proteger al terminar. Las máscaras y overlays pueden ocultar un rasgo sin modificarlo: ejecutar identity-check y revisión visual además de la protección.

Preparar un perfil ROI con presupuestos por rasgo y tiempos representativos. Canonicalize elimina solo movimiento rígido para comparar; no neutralizar deformaciones ni usar como referencia la animación defectuosa. Separar rasgos invariantes de expresiones permitidas. No aumentar el presupuesto para silenciar un resultado fallido sin explicar y comparar el cambio.

Cuando el usuario autorice mejoras, reparar herramientas/skills y animaciones con regresiones del fallo real. Mantener el candidato high-color-preserved aprobado. Una métrica no identifica semánticamente un gato ni sustituye la evaluación artística.
