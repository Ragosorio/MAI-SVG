---
name: mai-separate-parts
description: Preparar partes SVG conservando textura y transparencia mediante segmentación OpenCV asistida y recortes vectoriales.
---
# mai-separate-parts

Leer [herramientas](../../../docs/PRESERVATION.md). Ejecutar segment con rectángulos nombrados sobre PNG/WebP/JPG orientado. GrabCut distingue primer plano/fondo por color: no descubre anatomía ni regiones ocultas. Revisar contornos; ajustar hints o usar mode rectangle si la textura hace ambigua la separación.

Ejecutar separate sobre el SVG estático aprobado con el JSON de regiones. El viewBox debe coincidir con las dimensiones de segmentación. La última región posee los solapamientos. Se conserva una fuente vectorial compartida con referencias locales y máscaras; las partes admiten poses rígidas. No vincular automáticamente esas referencias a un rig de deformación.

Comparar el render en reposo con el original y probar una pose pequeña. Cuando se descubra un hueco, reconstruirlo como geometría explícita en lugar de copiar textura de ojos/boca a otras zonas. Preservar IDs, alfa y procedencia. Mejorar el algoritmo y esta skill usando casos de error guardados; registrar diferencias y límites en vez de afirmar segmentación anatómica automática.
