# Contrato de movimiento
Usar poses de grupos para movimiento rígido. Definir pivote antes de giro o escala. Flotar, giro, pulso y aparecer son recetas reales de keyframes; rechazan sobrescritura de pistas. Ajustar duración antes de la receta. `track.copy` reutiliza pistas; `track.edit` desplaza, estira, invierte o elimina. Tiempos fuera de duración revierten toda la transacción.

Morph: misma topología. Huesos y mallas: partes preparadas en coordenadas del documento. Máscaras de alfa, grupos transformados y SVG anidados requieren preparación explícita para deformación. Revisar inicio, mitad, fin y extremos del movimiento; un loop necesita continuidad de posición y velocidad según intención. El diagnóstico detecta valores de cierre distintos, pero no prueba continuidad de velocidad.

Componentes SVG insertados conservan geometría y SMIL; el rig de origen se hornea y sus metadatos no se combinan con el rig de la escena. Se puede animar la pose del componente desde el timeline MAI. Animación nativa importada se conserva al exportar; no se convierte automáticamente en pistas editables. Selectores CSS, referencias y nombres de keyframes se aíslan por componente mediante CSS Tree; reglas globales como @font-face/@property requieren preparación explícita.

Exportar editable para continuar autoría y standalone para distribución. Muestreo adaptativo con presupuesto explícito; no es una cota matemática continua. Chromium/Firefox/WebKit son pruebas distintas de Safari nativo.

Personajes: bibliotecas emotion.define/keyframe y sprite.define/keyframe, atlas por tiempos y preview GIF. Consultar docs/CHARACTERS.md; el rig anatómico de un raster no se infiere automáticamente.
